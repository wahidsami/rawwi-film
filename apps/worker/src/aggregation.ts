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
import { clusterByOverlap, clusterCanonicalKey } from "./methodology-v3/canonicalClustering.js";
import { generateScriptSummary } from "./scriptSummary.js";
import { callRevisitSpotter } from "./openai.js";
import { clearCachedJobResources } from "./jobAnalysisCache.js";
import { shouldSkipRevisitForJob, shouldSkipScriptSummaryForJob } from "./performanceGating.js";
import { config } from "./config.js";

export type SummaryJson = {
  job_id: string;
  script_id: string;
  generated_at: string;
  client_name?: string;
  script_title?: string;
  totals: {
    findings_count: number;
    severity_counts: { low: number; medium: number; high: number; critical: number };
    /** Number of unique incidents (canonical findings). Use for main report count. */
    unique_incidents_count?: number;
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
      depiction_type?: string;
      speaker_role?: string;
      context_confidence?: number | null;
      lexical_confidence?: number | null;
      policy_confidence?: number | null;
      rationale?: string | null;
      final_ruling?: string | null;
      narrative_consequence?: string | null;
      pillar_id?: string | null;
      secondary_pillar_ids?: string[];
      primary_article_id?: number | null;
      related_article_ids?: number[];
      canonical_finding_id?: string | null;
      policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
    }>;
  }>;
  canonical_findings?: Array<{
    canonical_finding_id: string;
    title_ar: string;
    evidence_snippet: string;
    severity: string;
    confidence: number;
    final_ruling?: string | null;
    rationale?: string | null;
    pillar_id?: string | null;
    primary_article_id?: number | null;
    related_article_ids?: number[];
    policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
    start_offset_global?: number | null;
    end_offset_global?: number | null;
    start_line_chunk?: number | null;
    end_line_chunk?: number | null;
    page_number?: number | null;
    /** PolicyMap atom key e.g. 4-1; checklist UI. */
    primary_policy_atom_id?: string | null;
    canonical_atom?: string | null;
    intensity?: number | null;
    context_impact?: number | null;
    legal_sensitivity?: number | null;
    audience_risk?: number | null;
  }>;
  /** Findings grouped by canonical atom (e.g. VIOLENCE, INSULT) for auditor overview. */
  findings_by_canonical_atom?: Array<{
    canonical_atom: string;
    count: number;
    severity_counts: { low: number; medium: number; high: number; critical: number };
    top_findings: Array<{
      canonical_finding_id: string;
      title_ar: string;
      severity: string;
      evidence_snippet: string;
    }>;
  }>;
  context_metrics?: {
    context_ok_count: number;
    needs_review_count: number;
    violation_count: number;
  };
  script_summary?: {
    synopsis_ar: string;
    key_risky_events_ar?: string;
    narrative_stance_ar?: string;
    compliance_posture_ar?: string;
    confidence: number;
  };
  /** Findings where rationale says "not a violation" — show as تنبيهات/ملاحظات للمخرج. */
  report_hints?: Array<{
    canonical_finding_id: string;
    title_ar: string;
    evidence_snippet: string;
    severity: string;
    confidence: number;
    final_ruling?: string | null;
    rationale?: string | null;
    pillar_id?: string | null;
    primary_article_id?: number | null;
    related_article_ids?: number[];
    policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
    start_offset_global?: number | null;
    end_offset_global?: number | null;
    start_line_chunk?: number | null;
    end_line_chunk?: number | null;
  }>;
  /** Separate light pass: words/phrases from glossary that appeared in the script — for "كلمات/عبارات للمراجعة" only. Does not affect violations. */
  words_to_revisit?: Array<{
    term: string;
    snippet: string;
    start_offset: number;
    end_offset: number;
  }>;
}

const COMPLIANCE_NEUTRAL_HINTS = ["محايد", "سياق درامي", "ليس تحريضي", "ليس تمجيد", "متوافق إجمالاً", "درامي نفسي"];

function scriptSuggestsNeutralContext(scriptSummary: SummaryJson["script_summary"]): boolean {
  if (!scriptSummary?.compliance_posture_ar && !scriptSummary?.narrative_stance_ar) return false;
  const text = [scriptSummary.compliance_posture_ar ?? "", scriptSummary.narrative_stance_ar ?? ""].join(" ");
  return COMPLIANCE_NEUTRAL_HINTS.some((hint) => text.includes(hint));
}

/**
 * When script summary indicates neutral/dramatic context (not inciting), downgrade
 * violation -> needs_review for non-critical canonical findings to align summary and rulings.
 */
function applySummaryContextToRulings(summary: SummaryJson): void {
  if (!scriptSuggestsNeutralContext(summary.script_summary)) return;
  const canon = summary.canonical_findings;
  if (!canon?.length) return;
  const byId = new Map(canon.map((f) => [f.canonical_finding_id, f]));
  let changed = 0;
  for (const f of canon) {
    if (f.final_ruling === "violation" && f.severity !== "critical") {
      (f as { final_ruling?: string }).final_ruling = "needs_review";
      changed++;
    }
  }
  if (changed > 0 && summary.context_metrics) {
    const violationCount = canon.filter((x) => x.final_ruling === "violation").length;
    const needsReviewCount = canon.filter((x) => x.final_ruling === "needs_review").length;
    const contextOkCount = canon.filter((x) => x.final_ruling === "context_ok").length;
    summary.context_metrics.violation_count = violationCount;
    summary.context_metrics.needs_review_count = needsReviewCount;
    summary.context_metrics.context_ok_count = contextOkCount;
  }
  if (changed > 0 && summary.findings_by_article) {
    for (const art of summary.findings_by_article) {
      for (const top of art.top_findings ?? []) {
        const loc = top.location as Record<string, unknown> | undefined;
        const v3 = loc?.v3 as Record<string, unknown> | undefined;
        const cid = v3?.canonical_finding_id as string | undefined;
        const c = cid ? byId.get(cid) : undefined;
        if (c && v3 && v3.final_ruling !== c.final_ruling) {
          v3.final_ruling = c.final_ruling ?? null;
        }
      }
    }
  }
}

/** Phrases in rationale that mean "not a violation" / acceptable context — move to report_hints. */
const RATIONALE_SAYS_NOT_VIOLATION = [
  // Explicit "not a violation"
  "لا يعد مخالفة",
  "لا توجد مخالفة",
  "لا يعتبر مخالفة",
  "لا تُعد مخالفة",
  "لا تعتبر مخالفة",
  "ليس مخالفة",
  "لا يشكل مخالفة",
  "لا توجد مخالفة واضحة",
  "لا يصل إلى حد المخالفة",
  "لا يرقى إلى مخالفة",
  "لا يُصنف كمخالفة",
  "لا يمكن اعتباره مخالفة",
  "لا يشكل انتهاكاً",
  "لا يشكل تجاوزاً",
  "لا يعد تجاوزاً",
  // Context acceptable / within bounds
  "السياق مقبول",
  "يعتبر السياق مقبولاً",
  "والسياق مقبولاً",
  "السياق طبيعي ولا يتجاوز",
  "السياق طبيعي",
  "ضمن السياق المقبول",
  "سياق مقبول",
  "مقبول في السياق",
  "متوافق مع الضوابط",
  "ضمن الضوابط",
  "لا يتعارض مع الضوابط",
  "لا خرق للضوابط",
  "لا انتهاك واضح",
  // Does not exceed / breach
  "لا يتجاوز ضوابط",
  "لا يخرق",
  "لا يخرق ضوابط",
  "لا يتجاوز الضوابط",
  "غير متجاوز للضوابط",
  // Positive handling / treatment
  "معالجة إيجابية",
  "معالجة إيجابية للسياق",
  "يعزز القيم",
  "رفض السلوك",
  // Innocent / no inappropriate content
  "بريء",
  "براءة",
  "رومانسي بريء",
  "غموض رومانسي بريء",
  "دون أي إيحاء",
  "لا إيحاءات جنسية",
  "لا يتضمن أي إيحاء",
  "لا يتضمن إيحاءات",
  "لا تجاوزات أخلاقية",
  "دون مشهد غير لائق",
  "لا يوجد مشهد غير لائق",
  "لا وصف جنسي",
  "دون وصف جنسي",
  "لا يشكل محتوى غير لائق",
  // "لا يتضمن أي" — use specific follow-ups to avoid false positives; keep only safe combo
  "لا يتضمن أي إيحاءات",
  "لا يتضمن أي تجاوز",
  "ولا يعد",
  // Dramatic / narrative / medical context (not endorsement)
  "سياق درامي فقط",
  "جزء من السياق الدرامي",
  "في إطار درامي",
  "في سياق مرضي",
  "في إطار علاجي",
  "جزء من هذيان",
  "هذيان المريض",
  "لا يعكس تحريضاً",
  "ليس تحريضاً",
  "ليس تمجيداً للعنف",
  "لا يروج للعنف",
  "لا يشكل تحريضاً",
  "لا يروّج للعنف",
  "يعكس كابوساً",
  "يعكس ذكرى",
  "ضمن إطار العمل الدرامي",
  "عنصر تشويق",
  "تشويق أو غموض رومانسي بريء",
  "يخدم السياق الدرامي",
  "يخدم السرد",
  "لأغراض الدراما",
  "لأغراض السرد",
  "قد لا يعد مخالفة",
  "لا يبدو مخالفة",
  "قد لا يعتبر مخالفة",
];

/** If the rationale clearly states it *is* a violation, do not move to hints even if it also mentions dramatic context. */
const RATIONALE_SAYS_VIOLATION = [
  "تخالف ضوابط",
  "تخالف المادة",
  "مخالفة ل",
  "ينتهك",
  "يخالف ضوابط",
  "يخالف المادة",
  "تعد مخالفة",
  "تعد مخالفة ل",
  "يعد مخالفة ل",
  "تستدعي تصنيف",
  "يتجاوز ضوابط المادة",
  "خالف المادة",
];

function rationaleSaysNotViolation(rationale: string | null | undefined): boolean {
  if (!rationale || rationale.trim() === "") return false;
  const r = rationale.trim();
  if (RATIONALE_SAYS_VIOLATION.some((phrase) => r.includes(phrase))) return false;
  return RATIONALE_SAYS_NOT_VIOLATION.some((phrase) => r.includes(phrase));
}

type CanonicalFindingItem = NonNullable<SummaryJson["canonical_findings"]>[number];

/**
 * Final gate: if the AI decided this is NOT a violation (context_ok or rationale says so),
 * move that finding to report_hints so it appears only in ملاحظات خاصة, not in violations.
 * Rule: one place only — either violations OR notes, never both.
 */
function applyReportGate(summary: SummaryJson): void {
  const canon = summary.canonical_findings;
  if (!canon?.length) return;

  const violations: CanonicalFindingItem[] = [];
  const hints: CanonicalFindingItem[] = [];

  for (const f of canon) {
    const isContextOk = (f.final_ruling ?? "").toLowerCase() === "context_ok";
    const rationaleSaysNot = rationaleSaysNotViolation(f.rationale);
    if (isContextOk || rationaleSaysNot) {
      hints.push(f);
    } else {
      violations.push(f);
    }
  }

  if (hints.length === 0) return;

  summary.canonical_findings = violations;
  summary.report_hints = hints;

  const policyArticles = getPolicyArticles();
  const severityOrder = (s: string) => (SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]) + 1) || 0;

  const severity_counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of violations) {
    if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
      severity_counts[f.severity as keyof typeof severity_counts]++;
    }
  }

  const canonicalByPrimary = new Map<number, CanonicalFindingItem[]>();
  for (const f of violations) {
    const aid = f.primary_article_id ?? 0;
    if (aid === 0 || aid === OUT_OF_SCOPE_ARTICLE_ID) continue;
    if (!canonicalByPrimary.has(aid)) canonicalByPrimary.set(aid, []);
    canonicalByPrimary.get(aid)!.push(f);
  }

  summary.findings_by_article = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const list = canonicalByPrimary.get(art.articleId) ?? [];
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const sorted = [...list].sort(
        (a, b) =>
          severityOrder(b.severity) - severityOrder(a.severity) || (b.confidence - a.confidence)
      );
      const top_findings = sorted.slice(0, 10).map((f) => ({
        atom_id: null as string | null,
        title_ar: f.title_ar,
        severity: f.severity,
        confidence: f.confidence,
        evidence_snippet: f.evidence_snippet,
        location: {
          v3: {
            primary_article_id: f.primary_article_id,
            related_article_ids: f.related_article_ids,
            canonical_finding_id: f.canonical_finding_id,
            pillar_id: f.pillar_id,
            rationale: f.rationale,
            final_ruling: f.final_ruling,
            policy_links: f.policy_links,
          },
        } as Record<string, unknown>,
        start_offset_global: f.start_offset_global,
        end_offset_global: f.end_offset_global,
        start_line_chunk: f.start_line_chunk,
        end_line_chunk: f.end_line_chunk,
        rationale: f.rationale ?? RATIONALE_FALLBACK,
        final_ruling: f.final_ruling ?? null,
        pillar_id: f.pillar_id ?? null,
        primary_article_id: f.primary_article_id ?? null,
        related_article_ids: f.related_article_ids ?? [],
        canonical_finding_id: f.canonical_finding_id,
        policy_links: f.policy_links ?? [],
      }));
      return {
        article_id: art.articleId,
        title_ar: art.title_ar,
        counts,
        triggered_atoms: [] as string[],
        top_findings,
      };
    })
    .filter((entry) => entry.top_findings.length > 0);

  summary.checklist_articles = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const list = canonicalByPrimary.get(art.articleId) ?? [];
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const total = list.length;
      const hasCritical = counts.critical > 0;
      const hasHigh = counts.high > 0;
      const hasMedium = counts.medium > 0;
      const hasLow = counts.low > 0;
      let status: "ok" | "not_scanned" | "warning" | "fail" = "ok";
      if (total === 0) status = "ok";
      else if (hasCritical || hasHigh) status = "fail";
      else if (hasMedium || hasLow) status = "warning";
      return {
        article_id: art.articleId,
        title_ar: art.title_ar,
        status,
        counts,
        triggered_atoms: [] as string[],
      };
    });

  summary.totals.findings_count = violations.length;
  summary.totals.unique_incidents_count = violations.length;
  summary.totals.severity_counts = severity_counts;

  const byCanonicalAtom = new Map<string, CanonicalFindingItem[]>();
  for (const f of violations) {
    const atom = (f as { canonical_atom?: string | null }).canonical_atom ?? "UNKNOWN";
    if (!byCanonicalAtom.has(atom)) byCanonicalAtom.set(atom, []);
    byCanonicalAtom.get(atom)!.push(f);
  }
  summary.findings_by_canonical_atom = [...byCanonicalAtom.entries()]
    .map(([canonical_atom, list]) => {
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const sorted = [...list].sort(
        (a, b) =>
          severityOrder(b.severity) - severityOrder(a.severity) || (b.confidence - a.confidence)
      );
      const top_findings = sorted.slice(0, 5).map((f) => ({
        canonical_finding_id: f.canonical_finding_id,
        title_ar: f.title_ar,
        severity: f.severity,
        evidence_snippet: f.evidence_snippet,
      }));
      return { canonical_atom, count: list.length, severity_counts: counts, top_findings };
    })
    .sort((a, b) => b.count - a.count);

  if (summary.context_metrics) {
    summary.context_metrics.violation_count = violations.filter((x) => x.final_ruling === "violation").length;
    summary.context_metrics.needs_review_count = violations.filter((x) => x.final_ruling === "needs_review").length;
    summary.context_metrics.context_ok_count = violations.filter((x) => x.final_ruling === "context_ok").length;
  }

  logger.info("Report gate applied", { movedToHints: hints.length, violationsCount: violations.length });
}

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
  page_number?: number | null;
  location: unknown;
  rationale_ar?: string | null;
  canonical_atom?: string | null;
  intensity?: number | null;
  context_impact?: number | null;
  legal_sensitivity?: number | null;
  audience_risk?: number | null;
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const SEVERITY_ORDER: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const RATIONALE_FALLBACK = "يتطلب تقييم مراجع مختص.";

/** Detect rationale that is only "المقتطف يخالف ضوابط المادة X" + excerpt (no real explanation). */
function isSnippetOnlyRationale(rationale: string | null | undefined, evidenceSnippet: string | null | undefined): boolean {
  if (!rationale || rationale.trim() === "") return false;
  const r = rationale.trim();
  if (!/المقتطف يخالف ضوابط/.test(r)) return false;
  const hasGuillemets = /«/.test(r) && /»/.test(r);
  const snippetLen = (evidenceSnippet || "").trim().length;
  const afterPhrase = r.replace(/^.*?المقتطف يخالف ضوابط[^.]*\.?\s*/, "").trim();
  const isMostlySnippet = snippetLen > 20 && afterPhrase.length <= snippetLen + 30;
  return hasGuillemets && (r.length < 180 || isMostlySnippet);
}

const BROAD_ARTICLES = new Set([4, 5]);

function primaryScoreForDb(f: DbFinding): number[] {
  const v3 = ((f.location as Record<string, unknown>)?.v3 as Record<string, unknown> | undefined) ?? {};
  const role = (v3.policy_links as Array<{ article_id: number; role?: string }> | undefined)?.find(
    (l) => l.article_id === f.article_id
  )?.role;
  const roleRank = role === "primary" ? 3 : role === "related" ? 2 : 1;
  const hasAtom = f.atom_id ? 2 : 1;
  const nonBroad = BROAD_ARTICLES.has(f.article_id) ? 0 : 1;
  const sev = SEVERITY_ORDER[f.severity] ?? 0;
  const conf = Math.round((f.confidence ?? 0) * 100);
  return [roleRank, hasAtom, nonBroad, sev, conf, -f.article_id];
}

function choosePrimaryFromDb(list: DbFinding[]): DbFinding {
  const specific = list.filter((f) => !BROAD_ARTICLES.has(f.article_id));
  const candidateList = specific.length > 0 ? specific : list;
  return [...candidateList].sort((a, b) => {
    const sa = primaryScoreForDb(a);
    const sb = primaryScoreForDb(b);
    for (let i = 0; i < sa.length; i++) {
      const d = (sb[i] ?? 0) - (sa[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  })[0];
}

function getFindingV3(f: DbFinding): Record<string, unknown> {
  const locationObj = ((f.location as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return ((locationObj.v3 as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
}

function getStoredCanonicalId(f: DbFinding): string | null {
  const raw = getFindingV3(f).canonical_finding_id;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

function buildCanonicalGroups(
  findings: DbFinding[],
  oneCardPerOccurrence: boolean,
  overlapRatio: number
): Array<{ key: string; list: DbFinding[] }> {
  if (oneCardPerOccurrence) {
    return findings.map((f, index) => ({ key: `occurrence-${index}`, list: [f] }));
  }

  const byStoredId = new Map<string, DbFinding[]>();
  const withoutStoredId: DbFinding[] = [];
  for (const f of findings) {
    const storedId = getStoredCanonicalId(f);
    if (!storedId) {
      withoutStoredId.push(f);
      continue;
    }
    if (!byStoredId.has(storedId)) byStoredId.set(storedId, []);
    byStoredId.get(storedId)!.push(f);
  }

  const groups: Array<{ key: string; list: DbFinding[] }> = [...byStoredId.entries()].map(([key, list]) => ({ key, list }));
  const overlapSeed = withoutStoredId.map((f) => ({
    ...f,
    start_offset_global: f.start_offset_global ?? undefined,
    end_offset_global: f.end_offset_global ?? undefined,
  }));
  const overlapGroups = clusterByOverlap(overlapSeed, overlapRatio) as Map<number, DbFinding[]>;
  let fallbackIndex = 0;
  for (const list of overlapGroups.values()) {
    groups.push({ key: `fallback-${fallbackIndex++}`, list });
  }
  return groups;
}

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

/** Options controlling how findings are grouped into canonical report cards. */
export type AnalysisSummaryOptions = {
  mergeStrategy?: "same_location_only" | "every_occurrence";
};

/** Overlap ratio for "same location": only merge findings that refer to nearly the same span (one card per location, multiple articles). */
const OVERLAP_SAME_LOCATION = 0.85;
/** Overlap ratio for "every occurrence": only merge when spans are effectively identical (one card per finding in practice). */
const OVERLAP_EVERY_OCCURRENCE = 1;

export function buildSummaryJson(
  jobId: string,
  scriptId: string,
  findings: DbFinding[],
  clientName?: string,
  scriptTitle?: string,
  analysisOptions?: AnalysisSummaryOptions | null
): SummaryJson {
  const generated_at = new Date().toISOString();
  const filtered = findings.filter((f) => f.article_id !== OUT_OF_SCOPE_ARTICLE_ID);
  const deduped = dedupeFindings(filtered);
  const policyArticles = getPolicyArticles();

  const severityOrder = (s: string) => (SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]) + 1) || 0;

  const overlapRatio =
    analysisOptions?.mergeStrategy === "every_occurrence" ? OVERLAP_EVERY_OCCURRENCE : OVERLAP_SAME_LOCATION;
  const oneCardPerOccurrence = analysisOptions?.mergeStrategy === "every_occurrence";

  // Build canonical findings from overlap clusters first (single source of truth).
  const canonicalMap = new Map<string, {
    canonical_finding_id: string;
    title_ar: string;
    evidence_snippet: string;
    severity: string;
    confidence: number;
    final_ruling?: string | null;
    rationale?: string | null;
    pillar_id?: string | null;
    primary_article_id?: number | null;
    related_article_ids?: number[];
    policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
    start_offset_global?: number | null;
    end_offset_global?: number | null;
    start_line_chunk?: number | null;
    end_line_chunk?: number | null;
    page_number?: number | null;
    primary_policy_atom_id?: string | null;
    canonical_atom?: string | null;
    intensity?: number | null;
    context_impact?: number | null;
    legal_sensitivity?: number | null;
    audience_risk?: number | null;
    /** DB source of primary row: lexicon_mandatory = true glossary insert; ai = model. */
    source?: string;
  }>();

  const canonicalGroups = buildCanonicalGroups(deduped, oneCardPerOccurrence, overlapRatio);

  for (const [clusterIndex, { key: groupKey, list }] of canonicalGroups.entries()) {
    const primary = choosePrimaryFromDb(list);
    const relatedArticleIds = [...new Set(list.map((f) => f.article_id).filter((id) => id !== primary.article_id))];
    const cId = oneCardPerOccurrence
      ? `CF-every-${clusterIndex}-${primary.article_id}`
      : groupKey.startsWith("CF-")
        ? groupKey
        : `CF-${Buffer.from(
          clusterCanonicalKey(
            list.map((f) => ({
              ...f,
              start_offset_global: f.start_offset_global ?? undefined,
              end_offset_global: f.end_offset_global ?? undefined,
            }))
          )
        ).toString("base64").replace(/=+$/g, "").slice(0, 20)}`;
    const v3 = getFindingV3(primary);
    const policyLinks: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }> = [
      { article_id: primary.article_id, role: "primary" },
      ...relatedArticleIds.map((id) => ({ article_id: id, role: "related" as const })),
    ];
    canonicalMap.set(cId, {
      canonical_finding_id: cId,
      title_ar: primary.title_ar,
      evidence_snippet: primary.evidence_snippet,
      severity: primary.severity,
      confidence: primary.confidence ?? 0,
      final_ruling: (v3.final_ruling as string | undefined) ?? null,
      rationale: (() => {
        const fromPrimary = (primary.rationale_ar != null && primary.rationale_ar.trim() !== "") ? primary.rationale_ar : null;
        const fromV3 = ((v3.rationale_ar as string | undefined) != null && (v3.rationale_ar as string).trim() !== "") ? (v3.rationale_ar as string) : null;
        const raw = fromPrimary ?? fromV3 ?? RATIONALE_FALLBACK;
        if (isSnippetOnlyRationale(raw, primary.evidence_snippet)) return RATIONALE_FALLBACK;
        return raw;
      })(),
      pillar_id: (v3.pillar_id as string | undefined) ?? null,
      primary_article_id: primary.article_id,
      related_article_ids: relatedArticleIds,
      policy_links: policyLinks,
      start_offset_global: primary.start_offset_global ?? null,
      end_offset_global: primary.end_offset_global ?? null,
      start_line_chunk: primary.start_line_chunk ?? null,
      end_line_chunk: primary.end_line_chunk ?? null,
      page_number: primary.page_number ?? null,
      primary_policy_atom_id: (() => {
        const n = normalizeAtomId(primary.atom_id, primary.article_id);
        return n && String(n).trim() !== "" ? String(n) : null;
      })(),
      canonical_atom: primary.canonical_atom ?? null,
      intensity: primary.intensity ?? null,
      context_impact: primary.context_impact ?? null,
      legal_sensitivity: primary.legal_sensitivity ?? null,
      audience_risk: primary.audience_risk ?? null,
      source:
        primary.source === "lexicon_mandatory"
          ? "lexicon_mandatory"
          : primary.source === "manual"
            ? "manual"
            : "ai",
    });
  }

  const canonical_findings = [...canonicalMap.values()].sort((a, b) =>
    severityOrder(b.severity) - severityOrder(a.severity) || (b.confidence - a.confidence)
  );

  // Severity counts from canonical (unique incidents).
  const severity_counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of canonical_findings) {
    if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
      severity_counts[f.severity as keyof typeof severity_counts]++;
    }
  }

  // findings_by_article: each canonical finding appears once under its primary article only.
  const canonicalByPrimary = new Map<number, typeof canonical_findings>();
  for (const f of canonical_findings) {
    const aid = f.primary_article_id ?? 0;
    if (aid === 0 || aid === OUT_OF_SCOPE_ARTICLE_ID) continue;
    if (!canonicalByPrimary.has(aid)) canonicalByPrimary.set(aid, []);
    canonicalByPrimary.get(aid)!.push(f);
  }

  const findings_by_article = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const list = canonicalByPrimary.get(art.articleId) ?? [];
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const sorted = [...list].sort(
        (a, b) =>
          severityOrder(b.severity) - severityOrder(a.severity) ||
          (b.confidence - a.confidence)
      );
      const top_findings = sorted.slice(0, 10).map((f) => ({
        atom_id: null as string | null,
        title_ar: f.title_ar,
        severity: f.severity,
        confidence: f.confidence,
        evidence_snippet: f.evidence_snippet,
        location: {
          v3: {
            primary_article_id: f.primary_article_id,
            related_article_ids: f.related_article_ids,
            canonical_finding_id: f.canonical_finding_id,
            pillar_id: f.pillar_id,
            rationale: f.rationale,
            final_ruling: f.final_ruling,
            policy_links: f.policy_links,
          },
        } as Record<string, unknown>,
        start_offset_global: f.start_offset_global,
        end_offset_global: f.end_offset_global,
        start_line_chunk: f.start_line_chunk,
        end_line_chunk: f.end_line_chunk,
        rationale: f.rationale ?? RATIONALE_FALLBACK,
        final_ruling: f.final_ruling ?? null,
        pillar_id: f.pillar_id ?? null,
        primary_article_id: f.primary_article_id ?? null,
        related_article_ids: f.related_article_ids ?? [],
        canonical_finding_id: f.canonical_finding_id,
        policy_links: f.policy_links ?? [],
      }));
      return {
        article_id: art.articleId,
        title_ar: art.title_ar,
        counts,
        triggered_atoms: [] as string[],
        top_findings,
      };
    })
    .filter((entry) => entry.top_findings.length > 0);

  const checklist_articles = policyArticles
    .filter((a) => a.articleId !== OUT_OF_SCOPE_ARTICLE_ID)
    .map((art) => {
      const list = canonicalByPrimary.get(art.articleId) ?? [];
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const total = list.length;
      const hasCritical = counts.critical > 0;
      const hasHigh = counts.high > 0;
      const hasMedium = counts.medium > 0;
      const hasLow = counts.low > 0;
      let status: "ok" | "not_scanned" | "warning" | "fail" = "ok";
      if (total === 0) status = "ok";
      else if (hasCritical || hasHigh) status = "fail";
      else if (hasMedium || hasLow) status = "warning";
      return {
        article_id: art.articleId,
        title_ar: art.title_ar,
        status,
        counts,
        triggered_atoms: [] as string[],
      };
    });

  const context_ok_count = canonical_findings.filter((f) => f.final_ruling === "context_ok").length;
  const needs_review_count = canonical_findings.filter((f) => f.final_ruling === "needs_review").length;
  const violation_count = canonical_findings.filter((f) => f.final_ruling === "violation").length;

  // findings_by_canonical_atom: group by canonical_atom for auditor overview.
  const byCanonicalAtom = new Map<string, typeof canonical_findings>();
  for (const f of canonical_findings) {
    const atom = (f as { canonical_atom?: string | null }).canonical_atom ?? "UNKNOWN";
    if (!byCanonicalAtom.has(atom)) byCanonicalAtom.set(atom, []);
    byCanonicalAtom.get(atom)!.push(f);
  }
  const findings_by_canonical_atom: SummaryJson["findings_by_canonical_atom"] = [...byCanonicalAtom.entries()]
    .map(([canonical_atom, list]) => {
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      for (const f of list) {
        if (SEVERITIES.includes(f.severity as (typeof SEVERITIES)[number])) {
          counts[f.severity as keyof typeof counts]++;
        }
      }
      const sorted = [...list].sort(
        (a, b) =>
          severityOrder(b.severity) - severityOrder(a.severity) || (b.confidence - a.confidence)
      );
      const top_findings = sorted.slice(0, 5).map((f) => ({
        canonical_finding_id: f.canonical_finding_id,
        title_ar: f.title_ar,
        severity: f.severity,
        evidence_snippet: f.evidence_snippet,
      }));
      return { canonical_atom, count: list.length, severity_counts: counts, top_findings };
    })
    .sort((a, b) => b.count - a.count);

  return {
    job_id: jobId,
    script_id: scriptId,
    generated_at,
    client_name: clientName,
    script_title: scriptTitle,
    totals: {
      findings_count: canonical_findings.length,
      severity_counts,
      unique_incidents_count: canonical_findings.length,
    },
    context_metrics: {
      context_ok_count,
      needs_review_count,
      violation_count,
    },
    checklist_articles,
    findings_by_article,
    canonical_findings,
    findings_by_canonical_atom,
    report_hints: [] as SummaryJson["report_hints"],
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

  const canonicalAtomSummaryHtml =
    (s.findings_by_canonical_atom?.length ?? 0) > 0
      ? `
  <section>
    <h2>ملخص حسب نوع المخالفة (Canonical Atom)</h2>
    <p>عدد الحوادث حسب التصنيف الموحد:</p>
    <ul>
    ${(s.findings_by_canonical_atom ?? [])
      .map(
        (a) =>
          `<li><strong>${a.canonical_atom}</strong>: ${a.count} (منخفضة: ${a.severity_counts.low}, متوسطة: ${a.severity_counts.medium}, عالية: ${a.severity_counts.high}, حرجة: ${a.severity_counts.critical})</li>`
      )
      .join("")}
    </ul>
  </section>`
      : "";

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

  const hintsHtml =
    (s.report_hints?.length ?? 0) > 0
      ? `
  <section>
    <h2>ملاحظات خاصة</h2>
    <p>هذه النقاط ليست مخالفات؛ يُنصح بمراعاتها عند التصوير (مثلاً ضوابط المظهر العام والقيم الإسلامية).</p>
    ${(s.report_hints ?? [])
      .map(
        (f) => `
    <div style="margin:1em 0; padding:0.5em; border:1px solid #7dd3fc; background:#f0f9ff;">
      <strong>ملاحظة</strong> (ثقة: ${f.confidence})<br/>
      <em>النص:</em> "${f.evidence_snippet}"<br/>
      <em>لماذا ليست مخالفة:</em> ${f.rationale ?? "—"}
    </div>`
      )
      .join("")}
  </section>`
      : "";

  const revisitHtml =
    (s.words_to_revisit?.length ?? 0) > 0
      ? `
  <section>
    <h2>كلمات / عبارات للمراجعة</h2>
    <p>ظهور الكلمات أو العبارات التالية في النص (للمراجعة عند التصوير — لا تُحسب مخالفات).</p>
    ${(s.words_to_revisit ?? [])
      .map(
        (m) => `
    <div style="margin:0.5em 0; padding:0.5em; border:1px solid #e5e7eb; background:#f9fafb;">
      <strong>${m.term}</strong><br/>
      <em>مقتطف:</em> "${m.snippet}"
    </div>`
      )
      .join("")}
  </section>`
      : "";

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
  ${canonicalAtomSummaryHtml}
  <section>
    <h2>٤ النتائج التفصيلية</h2>
    ${detailsHtml}
  </section>
  ${hintsHtml}
  ${revisitHtml}
</body>
</html>`;
}

/**
 * If no pending/judging chunks for job: load findings, build summary + report, upsert analysis_reports, set job completed.
 */
export async function runAggregation(jobId: string): Promise<void> {
  const aggregationStartedAt = Date.now();
  const hasActive = await jobHasActiveChunks(jobId);
  if (hasActive) return;

  const { data: job } = await supabase
    .from("analysis_jobs")
    .select(`
      script_id, 
      version_id, 
      created_by,
      normalized_text,
      progress_total,
      config_snapshot,
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
    const j = job as { script_id: string; created_by?: string | null };
    logAuditEvent(supabase, {
      event_type: "ANALYSIS_COMPLETED",
      target_type: "task",
      target_id: jobId,
      target_label: j.script_id,
      actor_user_id: j.created_by ?? null,
    }).catch(() => { });
    logger.info("Report already exists, job marked completed", { jobId });
    clearCachedJobResources(jobId);
    return;
  }

  const { data: findings, error: findingsErr } = await supabase
    .from("analysis_findings")
    .select(
      "source, article_id, atom_id, severity, confidence, title_ar, description_ar, evidence_snippet, start_offset_global, end_offset_global, start_line_chunk, end_line_chunk, page_number, location, rationale_ar, canonical_atom, intensity, context_impact, legal_sensitivity, audience_risk"
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

  const fullScriptText = ((job as { normalized_text?: string | null }).normalized_text ?? "").trim();

  const analysisOptions = (job as { config_snapshot?: { analysisOptions?: { mergeStrategy?: string } } }).config_snapshot?.analysisOptions;
  const summary = buildSummaryJson(jobId, job.script_id, list, clientName, scriptTitle, analysisOptions);
  const largeJobSize = {
    textLength: fullScriptText.length,
    chunkCount: Math.max(0, (((job as { progress_total?: number | null }).progress_total ?? 1) - 1)),
  };
  if (fullScriptText.trim()) {
    if (shouldSkipScriptSummaryForJob(largeJobSize)) {
      logger.info("Script summary skipped for large job", {
        jobId,
        textLength: largeJobSize.textLength,
        chunkCount: largeJobSize.chunkCount,
        textThreshold: config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD,
        chunkThreshold: config.ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD,
      });
    } else {
      const scriptSummary = await generateScriptSummary(fullScriptText, scriptTitle);
      if (scriptSummary) summary.script_summary = scriptSummary;
    }
    // Separate light pass: words to revisit (glossary terms that appear in script). Does not affect violations.
    if (shouldSkipRevisitForJob(largeJobSize)) {
      logger.info("Revisit pass skipped for large job", {
        jobId,
        textLength: largeJobSize.textLength,
        chunkCount: largeJobSize.chunkCount,
        textThreshold: config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD,
        chunkThreshold: config.ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD,
      });
    } else {
      try {
        const { data: lexiconRows } = await supabase
          .from("slang_lexicon")
          .select("term")
          .eq("is_active", true);
        const terms = (lexiconRows ?? []).map((r: { term?: string }) => (r.term ?? "").trim()).filter(Boolean);
        if (terms.length > 0) {
          const mentions = await callRevisitSpotter(fullScriptText, terms);
          if (mentions.length > 0) summary.words_to_revisit = mentions;
        }
      } catch (e) {
        logger.warn("Revisit pass skipped or failed", { jobId, error: String(e) });
      }
    }
  }
  applySummaryContextToRulings(summary);
  applyReportGate(summary);

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
  const jobRow = job as { script_id: string; created_by?: string | null };
  logAuditEvent(supabase, {
    event_type: "ANALYSIS_COMPLETED",
    target_type: "task",
    target_id: jobId,
    target_label: jobRow.script_id,
    actor_user_id: jobRow.created_by ?? null,
  }).catch(() => { });

  logger.info("Aggregation done", {
    jobId,
    findings_count: list.length,
    findings_count_total: summary.totals.findings_count,
    severity_counts: summary.totals.severity_counts,
    reportError: reportErr ?? null,
    aggregationDurationMs: Date.now() - aggregationStartedAt,
    scriptSummarySource: fullScriptText.length > 0 ? "analysis_jobs.normalized_text" : "none",
  });
  clearCachedJobResources(jobId);
}
