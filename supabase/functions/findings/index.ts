/**
 * Findings Edge Function
 *
 * GET  /findings?jobId=<uuid>   → list findings for a job (with review_status)
 * GET  /findings                → [] (backward compat)
 * POST /findings/review         → approve/revert a finding + recompute report aggregates
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";
import { logAuditCanonical } from "../_shared/audit.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

const FINDING_COLS = "id, job_id, script_id, version_id, source, article_id, atom_id, severity, confidence, title_ar, description_ar, evidence_snippet, start_offset_global, end_offset_global, start_line_chunk, end_line_chunk, location, evidence_hash, created_at";

async function selectFindings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string
) {
  const extCols = FINDING_COLS + ", review_status, review_reason, reviewed_by, reviewed_at, reviewed_role";
  const { data, error } = await supabase
    .from("analysis_findings")
    .select(extCols)
    .eq("job_id", jobId)
    .order("article_id", { ascending: true });
  if (!error) return { data, error: null };
  const fb = await supabase
    .from("analysis_findings")
    .select(FINDING_COLS)
    .eq("job_id", jobId)
    .order("article_id", { ascending: true });
  return fb;
}

function camelFinding(r: Record<string, unknown>, createdBy: string | null = null) {
  return {
    id: r.id,
    jobId: r.job_id,
    scriptId: r.script_id,
    versionId: r.version_id,
    source: r.source,
    articleId: r.article_id,
    atomId: r.atom_id ?? null,
    severity: r.severity,
    confidence: r.confidence ?? 0,
    titleAr: r.title_ar,
    descriptionAr: r.description_ar,
    evidenceSnippet: r.evidence_snippet,
    startOffsetGlobal: r.start_offset_global ?? null,
    endOffsetGlobal: r.end_offset_global ?? null,
    startLineChunk: r.start_line_chunk ?? null,
    endLineChunk: r.end_line_chunk ?? null,
    location: r.location ?? {},
    createdAt: r.created_at,
    reviewStatus: r.review_status ?? "violation",
    reviewReason: r.review_reason ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    reviewedRole: r.reviewed_role ?? null,
    createdBy: createdBy ?? (r.created_by as string | null) ?? null,
    manualComment: (r.manual_comment as string | null) ?? null,
  };
}

/**
 * Recompute aggregates for a job's report from analysis_findings (excluding approved).
 * Updates analysis_reports columns + summary_json.totals inline.
 */
async function recomputeReportAggregates(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  jobId: string,
  uid: string,
  actorRole: string
) {
  // 1) Count violations (exclude approved)
  const { data: allFindings } = await supabase
    .from("analysis_findings")
    .select("severity, review_status")
    .eq("job_id", jobId);

  const rows = (allFindings ?? []) as { severity: string; review_status?: string }[];
  const sc = { low: 0, medium: 0, high: 0, critical: 0 };
  let approvedCount = 0;
  for (const r of rows) {
    if ((r.review_status ?? "violation") === "approved") {
      approvedCount++;
    } else {
      const s = r.severity as keyof typeof sc;
      if (s in sc) sc[s]++;
    }
  }
  const findingsCount = sc.low + sc.medium + sc.high + sc.critical;

  // 2) Load existing report
  const { data: report } = await supabase
    .from("analysis_reports")
    .select("id, summary_json")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!report) {
    console.warn("[findings] recomputeReportAggregates: no report for job", jobId);
    return null;
  }

  // 3) Update summary_json.totals in-place
  const summaryJson = (report as any).summary_json ?? {};
  if (!summaryJson.totals) summaryJson.totals = {};
  summaryJson.totals.findings_count = findingsCount;
  summaryJson.totals.severity_counts = sc;
  summaryJson.approved_count = approvedCount;
  summaryJson.last_reviewed_at = new Date().toISOString();

  // 4) Update report row
  const updatePayload: Record<string, unknown> = {
    findings_count: findingsCount,
    severity_counts: sc,
    approved_count: approvedCount,
    last_reviewed_at: new Date().toISOString(),
    last_reviewed_by: uid,
    last_reviewed_role: actorRole,
    summary_json: summaryJson,
  };

  const { error: updErr } = await supabase
    .from("analysis_reports")
    .update(updatePayload)
    .eq("id", (report as any).id);

  if (updErr) {
    console.error("[findings] recomputeReportAggregates update error:", updErr.message);
    return null;
  }

  return { findingsCount, severityCounts: sc, approvedCount };
}

Deno.serve(async (req: Request) => {
  try {
    const origin = req.headers.get("origin") ?? undefined;
    const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
    if (req.method === "OPTIONS") return optionsResponse(req);

    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const uid = auth.userId;

    const supabase = createSupabaseAdmin();
    const rest = pathAfter("findings", req.url);
    const method = req.method;

    // Admin role check (Robust DB check)
    const isAdmin = await isUserAdmin(supabase, uid);

    // ── GET /findings?jobId=... or GET /findings?reportId=... ──
    if (method === "GET") {
      const url = new URL(req.url);
      let jobId = url.searchParams.get("jobId")?.trim();
      const reportId = url.searchParams.get("reportId")?.trim();

      if (reportId && !jobId) {
        const { data: report, error: reportErr } = await supabase
          .from("analysis_reports")
          .select("job_id")
          .eq("id", reportId)
          .maybeSingle();
        if (reportErr || !report) {
          return json({ error: "Report not found" }, 404);
        }
        jobId = (report as any).job_id;
      }

      if (!jobId) return json([]);

      // Admin bypass check (inherited from top scope)

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", jobId)
        .maybeSingle();

      // If not admin, strictly enforce ownership
      if (jobErr || !job || (!isAdmin && (job as any).created_by !== uid)) {
        return json({ error: "Forbidden" }, 403);
      }

      const createdBy = (job as any).created_by ?? null;
      const { data: rows, error } = await selectFindings(supabase, jobId);
      if (error) return json({ error: error.message }, 500);
      return json((rows ?? []).map((r) => camelFinding(r as Record<string, unknown>, createdBy)));
    }

    // ── POST /findings/review ──
    if (method === "POST" && rest === "review") {
      let body: { findingId?: string; toStatus?: string; reason?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const findingId = body.findingId?.trim();
      const toStatus = body.toStatus?.trim();
      const reason = body.reason?.trim();

      if (!findingId) return json({ error: "findingId required" }, 400);
      if (!toStatus || !["approved", "violation"].includes(toStatus)) {
        return json({ error: "toStatus must be 'approved' or 'violation'" }, 400);
      }
      if (!reason || reason.length < 2) {
        return json({ error: "reason is required (min 2 chars)" }, 400);
      }

      // Load finding
      const { data: finding } = await supabase
        .from("analysis_findings")
        .select("id, job_id, review_status")
        .eq("id", findingId)
        .maybeSingle();
      if (!finding) return json({ error: "Finding not found" }, 404);

      const f = finding as any;
      const fromStatus = f.review_status ?? "violation";
      const jobId = f.job_id;

      // Ownership check via job
      const { data: job } = await supabase
        .from("analysis_jobs")
        .select("created_by")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);

      const isOwner = (job as any).created_by === uid;
      if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);

      const actorRole = "user";

      // a) Update finding
      const { error: updErr } = await supabase
        .from("analysis_findings")
        .update({
          review_status: toStatus,
          review_reason: reason,
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
          reviewed_role: actorRole,
        })
        .eq("id", findingId);
      if (updErr) {
        console.error("[findings] review update error:", updErr.message);
        return json({ error: updErr.message }, 500);
      }

      // b) Insert audit row
      const { error: auditErr } = await supabase
        .from("finding_reviews")
        .insert({
          finding_id: findingId,
          job_id: jobId,
          from_status: fromStatus,
          to_status: toStatus,
          reason,
          actor_user_id: uid,
          actor_role: actorRole,
        });
      if (auditErr) {
        console.error("[findings] audit insert error:", auditErr.message);
      }

      const eventType = toStatus === "approved" ? "FINDING_MARKED_SAFE" : "FINDING_OVERRIDDEN";
      logAuditCanonical(supabase, {
        event_type: eventType,
        actor_user_id: uid,
        actor_role: actorRole,
        target_type: "report",
        target_id: jobId,
        target_label: findingId,
        result_status: "success",
        metadata: { fromStatus, toStatus, reason },
      }).catch((e) => console.warn("[findings] audit canonical:", e));

      // c) Recompute report aggregates
      const agg = await recomputeReportAggregates(supabase, jobId, uid, actorRole);

      return json({
        ok: true,
        findingId,
        fromStatus,
        toStatus,
        reportAggregates: agg,
      });
    }

    // ── POST /findings/manual ──
    if (method === "POST" && rest === "manual") {
      let body: {
        reportId?: string;
        scriptId?: string;
        versionId?: string;
        startOffsetGlobal?: number;
        endOffsetGlobal?: number;
        articleId?: number;
        atomId?: string | null;
        severity?: string;
        manualComment?: string;
      };
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const reportId = body.reportId?.trim();
      const scriptId = body.scriptId?.trim();
      const versionId = body.versionId?.trim();
      const startOffsetGlobal = body.startOffsetGlobal;
      const endOffsetGlobal = body.endOffsetGlobal;
      const articleId = body.articleId;
      const atomId = body.atomId?.trim() || null;
      const severity = body.severity?.trim();
      const manualComment = body.manualComment?.trim() ?? "";

      if (!reportId || !scriptId || !versionId) {
        return json({ error: "reportId, scriptId, versionId required" }, 400);
      }
      if (typeof startOffsetGlobal !== "number" || typeof endOffsetGlobal !== "number" || startOffsetGlobal < 0 || endOffsetGlobal <= startOffsetGlobal) {
        return json({ error: "startOffsetGlobal and endOffsetGlobal required (0 <= start < end)" }, 400);
      }
      if (articleId == null || typeof articleId !== "number") {
        return json({ error: "articleId required" }, 400);
      }
      const severityOk = severity && ["low", "medium", "high", "critical"].includes(severity.toLowerCase());
      if (!severityOk) {
        return json({ error: "severity must be low, medium, high, or critical" }, 400);
      }

      const { data: script, error: scriptErr } = await supabase
        .from("scripts")
        .select("id, created_by, assignee_id")
        .eq("id", scriptId)
        .maybeSingle();
      if (scriptErr || !script) {
        return json({ error: "Script not found" }, 404);
      }
      const s = script as { created_by: string | null; assignee_id: string | null };
      if (!isAdmin && s.created_by !== uid && s.assignee_id !== uid) {
        return json({ error: "Forbidden" }, 403);
      }

      const { data: report, error: reportErr } = await supabase
        .from("analysis_reports")
        .select("id, job_id, script_id")
        .eq("id", reportId)
        .maybeSingle();
      if (reportErr || !report) {
        return json({ error: "Report not found" }, 404);
      }
      const r = report as { job_id: string; script_id: string };
      if (r.script_id !== scriptId) {
        return json({ error: "Report does not belong to this script" }, 400);
      }
      const jobId = r.job_id;

      const { data: textRow, error: textErr } = await supabase
        .from("script_text")
        .select("content")
        .eq("version_id", versionId)
        .maybeSingle();
      if (textErr || !textRow) {
        return json({ error: "Script text not found for version" }, 404);
      }
      const content = (textRow as { content: string }).content ?? "";
      const evidenceSnippet = content.slice(startOffsetGlobal, endOffsetGlobal) || body.manualComment?.slice(0, 500) || "—";

      const evidenceHash = "manual-" + crypto.randomUUID();
      const titleAr = "ملاحظة يدوية";
      const descriptionAr = manualComment || evidenceSnippet;

      const insertPayload: Record<string, unknown> = {
        job_id: jobId,
        script_id: scriptId,
        version_id: versionId,
        source: "manual",
        created_by: uid,
        article_id: articleId,
        atom_id: atomId,
        severity: severity!.toLowerCase(),
        confidence: 1,
        title_ar: titleAr,
        description_ar: descriptionAr,
        evidence_snippet: evidenceSnippet,
        start_offset_global: startOffsetGlobal,
        end_offset_global: endOffsetGlobal,
        evidence_hash: evidenceHash,
        manual_comment: manualComment || null,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("analysis_findings")
        .insert(insertPayload)
        .select("id, job_id, script_id, version_id, source, article_id, atom_id, severity, confidence, title_ar, description_ar, evidence_snippet, start_offset_global, end_offset_global, created_at, review_status, created_by, manual_comment")
        .single();

      if (insertErr) {
        console.error("[findings] manual insert error:", insertErr.message);
        return json({ error: insertErr.message }, 500);
      }

      await recomputeReportAggregates(supabase, jobId, uid, "user");

      const row = inserted as Record<string, unknown>;
      return json(camelFinding(row, (row.created_by as string) ?? uid));
    }

    // Legacy stubs
    if (method === "POST" && rest === "") return json({ error: "Not implemented" }, 501);
    if (method === "PUT" && rest.length > 0) return json({ error: "Not implemented" }, 501);

    return json({ error: "Not Found" }, 404);
  } catch (e) {
    console.error("[findings] UNHANDLED ERROR:", e);
    return json({ error: String(e) }, 500);
  }
});
