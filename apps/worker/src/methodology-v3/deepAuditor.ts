import { config } from "../config.js";
import { callAuditorRaw, parseAuditorWithRepair } from "../openai.js";
import { logger } from "../logger.js";
import type { AuditorAssessment } from "../schemas.js";
const AUDITOR_RATIONALE_DEFAULT = "يتطلب تقييم مراجع مختص.";

type CanonicalCandidate = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  primary_article_id: number;
  related_article_ids: number[];
  pillar_id?: string;
};

function uniqueNums(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)))];
}

function normalizeRelated(related: number[], primaryArticle: number): number[] {
  return uniqueNums(related)
    .filter((id) => id >= 1 && id <= 25 && id !== primaryArticle);
}

function isConfidenceInconsistent(a: AuditorAssessment): boolean {
  const main = a.confidence ?? 0.7;
  const b = a.confidence_breakdown;
  if (!b) return false;
  const parts = [b.lexical, b.context, b.policy].filter((x) => x != null) as number[];
  if (parts.length < 2) return false;
  const avg = parts.reduce((s, x) => s + x, 0) / parts.length;
  return Math.abs(avg - main) > 0.25;
}

function applyGuardrails(a: AuditorAssessment): AuditorAssessment {
  const primaryArticle = a.primary_article_id ?? 0;
  const related = normalizeRelated(a.related_article_ids ?? [], primaryArticle);
  let final_ruling = a.final_ruling;
  if (a.contradiction_flag || isConfidenceInconsistent(a)) {
    final_ruling = "needs_review";
  }
  return {
    ...a,
    related_article_ids: related,
    final_ruling,
  };
}

function buildCanonicalCandidates(findings: HybridFindingLike[]): CanonicalCandidate[] {
  const byCanonical = new Map<string, HybridFindingLike[]>();
  for (const f of findings) {
    const id = f.canonical_finding_id ?? `LEGACY-${f.article_id}-${f.start_offset_global ?? 0}-${f.end_offset_global ?? 0}`;
    if (!byCanonical.has(id)) byCanonical.set(id, []);
    byCanonical.get(id)!.push(f);
  }
  const out: CanonicalCandidate[] = [];
  for (const [id, list] of byCanonical.entries()) {
    const primary = list.find((x) => (x.primary_article_id ?? x.article_id) === x.article_id) ?? list[0];
    const primaryArticle = primary.primary_article_id ?? primary.article_id;
    const related = uniqueNums([
      ...list.flatMap((x) => x.related_article_ids ?? []),
      ...list.map((x) => x.article_id),
    ]).filter((a) => a !== primaryArticle && a >= 1 && a <= 25);
    out.push({
      canonical_finding_id: id,
      title_ar: primary.title_ar || "مخالفة محتوى",
      evidence_snippet: primary.evidence_snippet || "",
      severity: primary.severity || "medium",
      confidence: primary.confidence ?? 0.7,
      primary_article_id: primaryArticle,
      related_article_ids: related,
      pillar_id: primary.pillar_id,
    });
  }
  return out;
}

export async function runDeepAuditorPass(args: {
  findings: HybridFindingLike[];
  fullText: string | null;
}): Promise<HybridFindingLike[]> {
  const { findings, fullText } = args;
  if (findings.length === 0 || !config.ANALYSIS_DEEP_AUDITOR || !config.OPENAI_API_KEY) return findings;

  const candidates = buildCanonicalCandidates(findings);
  const raw = await callAuditorRaw(
    JSON.stringify({ candidates }),
    fullText ?? "",
    config.OPENAI_AUDITOR_MODEL
  );
  const parsed = await parseAuditorWithRepair(raw, config.OPENAI_AUDITOR_MODEL);
  const seen = new Set<string>();
  const dedupedAssessments: AuditorAssessment[] = [];
  for (const a of parsed.assessments) {
    const id = a.canonical_finding_id;
    if (seen.has(id)) continue;
    seen.add(id);
    dedupedAssessments.push(applyGuardrails(a));
  }
  const byId = new Map(dedupedAssessments.map((a) => [a.canonical_finding_id, a]));

  const withRationale = dedupedAssessments.filter(
    (a) => a.rationale_ar != null && a.rationale_ar.trim() !== "" && a.rationale_ar !== AUDITOR_RATIONALE_DEFAULT
  );
  logger.info("Auditor assessments rationale stats", {
    total: dedupedAssessments.length,
    withNonDefaultRationale: withRationale.length,
  });

  return findings.map((f) => {
    const cId = f.canonical_finding_id ?? `LEGACY-${f.article_id}-${f.start_offset_global ?? 0}-${f.end_offset_global ?? 0}`;
    const a = byId.get(cId);
    if (!a) return f;
    const primaryArticle = a.primary_article_id ?? f.primary_article_id ?? f.article_id;
    const related = normalizeRelated(a.related_article_ids ?? [], primaryArticle);
    return {
      ...f,
      canonical_finding_id: cId,
      title_ar: a.title_ar ?? f.title_ar,
      final_ruling: a.final_ruling ?? f.final_ruling ?? "needs_review",
      rationale_ar: (a.rationale_ar && a.rationale_ar.trim() !== "")
        ? a.rationale_ar
        : (f.rationale_ar && f.rationale_ar.trim() !== "")
          ? f.rationale_ar
          : AUDITOR_RATIONALE_DEFAULT,
      pillar_id: a.pillar_id ?? f.pillar_id,
      primary_article_id: primaryArticle,
      related_article_ids: related,
      severity: a.severity ?? f.severity,
      confidence: a.confidence ?? f.confidence,
      lexical_confidence: a.confidence_breakdown?.lexical ?? f.lexical_confidence ?? null,
      context_confidence: a.confidence_breakdown?.context ?? f.context_confidence ?? null,
      policy_confidence: a.confidence_breakdown?.policy ?? f.policy_confidence ?? null,
      policy_links: [
        { article_id: primaryArticle, role: "primary" },
        ...related.map((id) => ({ article_id: id, role: "related" as const })),
      ],
    };
  });
}
