import { supabase } from "./db.js";
import { sha256 } from "./hash.js";
import { incrementJobProgress, jobHasActiveChunks } from "./jobs.js";
import { logger } from "./logger.js";
import {
  getPolicyArticles,
  getPolicyArticle,
  getPolicyAtomTitle,
  normalizeAtomId,
  atomIdNumeric,
  OUT_OF_SCOPE_ARTICLE_ID,
} from "./policyMap.js";

export type SummaryJson = {
  job_id: string;
  script_id: string;
  generated_at: string;
  client_name?: string;
  script_title?: string;
  totals: {
    findings_count: number;
    severity_counts: { low: number; medium: number; high: number; critical: number };
  };
  checklist_articles: Array<{
    article_id: number;
    title_ar: string;
    status: "ok" | "not_scanned" | "warning" | "fail";
    counts: Record<string, number>;
    triggered_atoms: string[];
  }>;
  findings_by_article: Array<{
    article_id: number;
    title_ar: string;
    counts: Record<string, number>;
    triggered_atoms: string[];
    top_findings: Array<{
      atom_id: string | null;
      title_ar: string;
      severity: string;
      confidence: number;
      evidence_snippet: string;
      location: Record<string, unknown>;
      start_offset_global?: number | null;
      end_offset_global?: number | null;
      start_line_chunk?: number | null;
      end_line_chunk?: number | null;
      is_interpretive?: boolean;
    }>;
  }>;
};

type DbFinding = {
  source?: string;
  article_id: number;
  atom_id: string | null;
  severity: string;
  confidence: number | null;
  title_ar: string;
  description_ar: string;
  evidence_snippet: string;
  start_offset_global: number | null;
  end_offset_global: number | null;
  start_line_chunk: number | null;
  end_line_chunk: number | null;
  location: unknown;
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const SEVERITY_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

/** Dedup key: same source + article + atom + span + snippet → keep one (highest severity). */
function dedupKey(f: DbFinding, normAtom: string): string {
  const start = f.start_offset_global ?? 0;
  const end = f.end_offset_global ?? start;
  const snipHash = sha256(f.evidence_snippet ?? "");
  return `${f.source ?? "ai"}|${f.article_id}|${normAtom}|${start}-${end}|${snipHash}`;
}

/** Deduplicate findings: keep highest severity per key. */
function dedupeFindings(findings: DbFinding[]): DbFinding[] {
  const byKey = new Map<string, DbFinding>();
  for (const f of findings) {
    const normAtom = normalizeAtomId(f.atom_id, f.article_id);
    const key = dedupKey(f, normAtom);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, f);
      continue;
    }
    const ordNew = SEVERITY_ORDER[f.severity] ?? 0;
    const ordOld = SEVERITY_ORDER[existing.severity] ?? 0;
    if (ordNew > ordOld) byKey.set(key, f);
  }
  return Array.from(byKey.values());
}

export function buildSummaryJson(
  jobId: string,
  scriptId: string,
  findings: DbFinding[],
  clientName?: string,
  scriptTitle?: string
): SummaryJson {
  const generated_at = new Date().toISOString();
  const filtered = findings.filter((f) => f.article_id !== OUT_OF_SCOPE_ARTICLE_ID);
  const deduped = dedupeFindings(filtered);

  const severity_counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of deduped) {
    if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
      severity_counts[f.severity as keyof typeof severity_counts]++;
    }
  }

  const policyArticles = getPolicyArticles();
  const byArticle = new Map<
    number,
    { title_ar: string; findings: DbFinding[]; counts: Record<string, number>; atoms: Set<string> }
  >();
  for (const art of policyArticles) {
    if (art.articleId === OUT_OF_SCOPE_ARTICLE_ID) continue;
    byArticle.set(art.articleId, {
      title_ar: art.title_ar,
      findings: [],
      counts: { low: 0, medium: 0, high: 0, critical: 0 },
      atoms: new Set(),
    });
  }
  for (const f of deduped) {
    const entry = byArticle.get(f.article_id);
    if (entry) {
      entry.findings.push(f);
      if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
        entry.counts[f.severity as keyof typeof entry.counts]++;
      }
      const normAtom = normalizeAtomId(f.atom_id, f.article_id);
      if (normAtom) entry.atoms.add(normAtom);
    }
  }

  const checklist_articles = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const entry = byArticle.get(art.articleId)!;
      const total = entry.findings.length;
      const hasCritical = entry.counts.critical > 0;
      const hasHigh = entry.counts.high > 0;
      const hasMedium = entry.counts.medium > 0;
      const hasLow = entry.counts.low > 0;
      let status: "ok" | "not_scanned" | "warning" | "fail" = "ok";
      if (total === 0) status = "ok";
      else if (hasCritical || hasHigh) status = "fail";
      else if (hasMedium || hasLow) status = "warning";
      return {
        article_id: art.articleId,
        title_ar: entry.title_ar,
        status,
        counts: entry.counts,
        triggered_atoms: [...entry.atoms],
      };
    });

  const severityOrder = (s: string) => (SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]) + 1) || 0;
  const findings_by_article = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const entry = byArticle.get(art.articleId)!;
      return { art, entry };
    })
    .filter(({ entry }) => entry.findings.length > 0)
    .map(({ art, entry }) => {
      const sorted = entry.findings
        .sort(
          (a, b) =>
            atomIdNumeric(normalizeAtomId(a.atom_id, a.article_id)) - atomIdNumeric(normalizeAtomId(b.atom_id, b.article_id)) ||
            (a.start_offset_global ?? 0) - (b.start_offset_global ?? 0) ||
            severityOrder(b.severity) - severityOrder(a.severity) ||
            (b.confidence ?? 0) - (a.confidence ?? 0)
        )
        .slice(0, 10)
        .map((f) => {
          const normAtom = normalizeAtomId(f.atom_id, f.article_id) || null;
          const titleAr = getPolicyAtomTitle(f.article_id, normAtom) ?? f.title_ar;
          return {
            atom_id: normAtom,
            title_ar: titleAr,
            severity: f.severity,
            confidence: f.confidence ?? 0,
            evidence_snippet: f.evidence_snippet,
            location: (f.location as Record<string, unknown>) ?? {},
            start_offset_global: f.start_offset_global,
            end_offset_global: f.end_offset_global,
            start_line_chunk: f.start_line_chunk,
            end_line_chunk: f.end_line_chunk,
          };
        });
      return {
        article_id: art.articleId,
        title_ar: entry.title_ar,
        counts: entry.counts,
        triggered_atoms: [...entry.atoms],
        top_findings: sorted,
      };
    });

  return {
    job_id: jobId,
    script_id: scriptId,
    generated_at,
    client_name: clientName,
    script_title: scriptTitle,
    totals: {
      findings_count: deduped.length,
      severity_counts,
    },
    checklist_articles,
    findings_by_article,
  };
}

export function buildReportHtml(summary: SummaryJson): string {
  const s = summary;
  const severityRow = (label: string, count: number) =>
    `<tr><td>${label}</td><td>${count}</td></tr>`;
  const severityTable = `
    <table border="1" cellpadding="4"><tbody>
      ${severityRow("منخفضة", s.totals.severity_counts.low)}
      ${severityRow("متوسطة", s.totals.severity_counts.medium)}
      ${severityRow("عالية", s.totals.severity_counts.high)}
      ${severityRow("حرجة", s.totals.severity_counts.critical)}
    </tbody></table>`;

  const checklistRows = s.checklist_articles
    .filter((c) => c.counts.low + c.counts.medium + c.counts.high + c.counts.critical > 0)
    .map(
      (c) =>
        `<tr><td>${c.article_id}</td><td>${c.title_ar}</td><td>${c.status}</td><td>${c.counts.low}</td><td>${c.counts.medium}</td><td>${c.counts.high}</td><td>${c.counts.critical}</td></tr>`
    )
    .join("");

  let detailsHtml = "";
  for (const art of s.findings_by_article) {
    detailsHtml += `<h3>المادة ${art.article_id}: ${art.title_ar}</h3>`;
    for (const f of art.top_findings) {
      detailsHtml += `
        <div style="margin:1em 0; padding:0.5em; border:1px solid #ccc;">
          <strong>${f.title_ar}</strong> (${f.severity}, ثقة: ${f.confidence})<br/>
          <em>الدليل:</em> "${f.evidence_snippet}"
        </div>`;
    }
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"/><title>تقرير التحليل</title></head>
<body>
  <h1>تقرير تحليل المحتوى (GCAM)</h1>
  <section>
    <h2>١ بيانات عامة</h2>
    <p>معرف المهمة: ${s.job_id}</p>
    <p>معرف السيناريو: ${s.script_id}</p>
    <p>وقت التوليد: ${s.generated_at}</p>
  </section>
  <section>
    <h2>٢ ملخص تنفيذي</h2>
    <p>إجمالي المخالفات: ${s.totals.findings_count}</p>
    ${severityTable}
  </section>
  <section>
    <h2>٣ مصفوفة الالتزام</h2>
    <table border="1" cellpadding="4">
      <thead><tr><th>المادة</th><th>العنوان</th><th>الحالة</th><th>منخفضة</th><th>متوسطة</th><th>عالية</th><th>حرجة</th></tr></thead>
      <tbody>${checklistRows}</tbody>
    </table>
  </section>
  <section>
    <h2>٤ النتائج التفصيلية</h2>
    ${detailsHtml}
  </section>
</body>
</html>`;
}

/**
 * If no pending/judging chunks for job: load findings, build summary + report, upsert analysis_reports, set job completed.
 */
export async function runAggregation(jobId: string): Promise<void> {
  const hasActive = await jobHasActiveChunks(jobId);
  if (hasActive) return;

  const { data: job } = await supabase
    .from("analysis_jobs")
    .select(`
      script_id, 
      version_id, 
      created_by,
      scripts (
        title,
        clients (
          name_ar,
          name_en
        )
      )
    `)
    .eq("id", jobId)
    .single();

  if (!job) {
    logger.warn("runAggregation: job not found", { jobId });
    return;
  }

  const scriptData = (job as any).scripts;
  const clientName = scriptData?.clients?.name_ar || scriptData?.clients?.name_en;
  const scriptTitle = scriptData?.title;

  const { data: existing } = await supabase
    .from("analysis_reports")
    .select("id")
    .eq("job_id", jobId)
    .single();
  if (existing) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", jobId);
    const { logAuditEvent } = await import("./audit.js");
    logAuditEvent(supabase, {
      event_type: "ANALYSIS_COMPLETED",
      target_type: "task",
      target_id: jobId,
      target_label: job.script_id,
    }).catch(() => { });
    logger.info("Report already exists, job marked completed", { jobId });
    return;
  }

  const { data: findings, error: findingsErr } = await supabase
    .from("analysis_findings")
    .select(
      "source, article_id, atom_id, severity, confidence, title_ar, description_ar, evidence_snippet, start_offset_global, end_offset_global, start_line_chunk, end_line_chunk, location"
    )
    .eq("job_id", jobId);

  if (findingsErr) {
    logger.error("Aggregation: failed to load findings", { jobId, error: findingsErr });
  }

  const list = (findings ?? []) as DbFinding[];
  logger.info("Aggregation findings loaded", {
    jobId,
    findingsLoaded: list.length,
    severityBreakdown: {
      low: list.filter(f => f.severity === "low").length,
      medium: list.filter(f => f.severity === "medium").length,
      high: list.filter(f => f.severity === "high").length,
      critical: list.filter(f => f.severity === "critical").length,
    },
    queryError: findingsErr ?? null,
  });

  const summary = buildSummaryJson(jobId, job.script_id, list, clientName, scriptTitle);
  const reportHtml = buildReportHtml(summary);

  const reportRow: Record<string, unknown> = {
    job_id: jobId,
    script_id: job.script_id,
    version_id: job.version_id,
    summary_json: summary as unknown as Record<string, unknown>,
    report_html: reportHtml,
    findings_count: summary.totals.findings_count,
    severity_counts: summary.totals.severity_counts as unknown as Record<string, unknown>,
  };
  const j = job as { created_by?: string | null };
  if (j.created_by != null) reportRow.created_by = j.created_by;

  const { error: reportErr } = await supabase.from("analysis_reports").upsert(
    reportRow,
    { onConflict: "job_id" }
  );

  if (reportErr) {
    logger.error("Aggregation: report upsert FAILED", { jobId, error: reportErr });
  }

  // Increment progress for the aggregation step (+1 that was reserved)
  await incrementJobProgress(jobId);

  // Mark completed with progress pinned to 100%
  const { data: jobFinal } = await supabase
    .from("analysis_jobs")
    .select("progress_total")
    .eq("id", jobId)
    .single();
  const total = jobFinal?.progress_total ?? 1;
  await supabase
    .from("analysis_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      progress_done: total,
      progress_percent: 100,
    })
    .eq("id", jobId);

  const { logAuditEvent } = await import("./audit.js");
  logAuditEvent(supabase, {
    event_type: "ANALYSIS_COMPLETED",
    target_type: "task",
    target_id: jobId,
    target_label: job.script_id,
  }).catch(() => { });

  logger.info("Aggregation done", {
    jobId,
    findings_count: list.length,
    findings_count_total: summary.totals.findings_count,
    severity_counts: summary.totals.severity_counts,
    reportError: reportErr ?? null,
  });
}
