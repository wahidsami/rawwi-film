import { config } from "../config.js";
import { getGcamRefsForCanonicalAtom } from "../canonicalAtomMapping.js";
import { normalizeMisusedGlossaryPassTitle } from "../findingTitleNormalize.js";
import { callAuditorRaw, callRationaleOnly, parseAuditorWithRepair } from "../openai.js";
import { logger } from "../logger.js";
import type { AuditorAssessment } from "../schemas.js";
import type { HybridFindingLike } from "./contextArbiter.js";
import { shouldSkipDeepAuditorForJob } from "../performanceGating.js";

const AUDITOR_RATIONALE_DEFAULT = "يتطلب تقييم مراجع مختص.";
const RATIONALE_ONLY_BATCH_SIZE = 6;

type CanonicalCandidate = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  primary_article_id: number;
  related_article_ids: number[];
  pillar_id?: string;
  depiction_type?: string | null;
  speaker_role?: string | null;
  narrative_consequence?: string | null;
  final_ruling_hint?: string | null;
  context_confidence?: number | null;
  policy_hint_rationale?: string | null;
};

function uniqueNums(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)))];
}

function normalizeRelated(related: number[], primaryArticle: number): number[] {
  return uniqueNums(related)
    .filter((id) => id >= 1 && id <= 25 && id !== primaryArticle);
}

function canonicalAtomForFinding(f: HybridFindingLike): string | null {
  return ((f as { canonical_atom?: string | null }).canonical_atom ?? null);
}

function basePrimaryArticleForFinding(f: HybridFindingLike): number {
  const primary = f.primary_article_id ?? f.article_id;
  return typeof primary === "number" && primary >= 1 && primary <= 25 ? primary : 5;
}

function chooseSafePrimaryArticle(
  proposedPrimary: number | null | undefined,
  f: HybridFindingLike
): number {
  const fallbackPrimary = basePrimaryArticleForFinding(f);
  if (typeof proposedPrimary !== "number" || proposedPrimary < 1 || proposedPrimary > 25) {
    return fallbackPrimary;
  }
  const canonicalAtom = canonicalAtomForFinding(f);
  if (!canonicalAtom) return proposedPrimary;
  const allowedArticleIds = [...new Set(getGcamRefsForCanonicalAtom(canonicalAtom).map((ref) => ref.article_id))];
  if (allowedArticleIds.length === 0) return proposedPrimary;
  return allowedArticleIds.includes(proposedPrimary) ? proposedPrimary : fallbackPrimary;
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

function isWeakRationaleText(value: string | null | undefined): boolean {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (text === AUDITOR_RATIONALE_DEFAULT) return true;
  if (text.length < 24) return true;
  return [
    /^وجود /,
    /^مطابقة /,
    /^مخالفة /,
    /^إشارة /,
    /^يحتوي النص/,
    /^يحتوي المقتطف/,
    /^يحتاج مراجعة/,
    /^يتطلب تقييم/,
  ].some((pattern) => pattern.test(text));
}

function hasExplicitArticleMismatch(value: string | null | undefined, primaryArticle: number): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;
  const mentionedArticles = [...text.matchAll(/مادة\s+(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num));
  if (mentionedArticles.length === 0) return false;
  return !mentionedArticles.includes(primaryArticle);
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
      depiction_type: primary.depiction_type ?? null,
      speaker_role: primary.speaker_role ?? null,
      narrative_consequence: primary.narrative_consequence ?? null,
      final_ruling_hint: primary.final_ruling ?? null,
      context_confidence: primary.context_confidence ?? null,
      policy_hint_rationale: primary.rationale_ar ?? null,
    });
  }
  return out;
}

export async function runDeepAuditorPass(args: {
  findings: HybridFindingLike[];
  fullText: string | null;
  enabled?: boolean;
  auditorContext?: string | null;
  signal?: AbortSignal;
}): Promise<HybridFindingLike[]> {
  const { findings, fullText } = args;
  if (findings.length === 0 || args.enabled === false || !config.ANALYSIS_DEEP_AUDITOR || !config.OPENAI_API_KEY) return findings;
  if (shouldSkipDeepAuditorForJob({ textLength: fullText?.length ?? 0 })) {
    logger.info("Deep auditor skipped for large job", {
      findingsCount: findings.length,
      textLength: fullText?.length ?? 0,
      textThreshold: config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD,
    });
    return findings;
  }

  const candidates = buildCanonicalCandidates(findings);
  const raw = await callAuditorRaw(
    JSON.stringify({ candidates }),
    fullText ?? "",
    config.OPENAI_AUDITOR_MODEL,
    undefined,
    args.auditorContext,
    { signal: args.signal }
  );
  const parsed = await parseAuditorWithRepair(raw, config.OPENAI_AUDITOR_MODEL, {
    signal: args.signal,
  });
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
    (a) => !isWeakRationaleText(a.rationale_ar)
  );
  logger.info("Auditor assessments rationale stats", {
    total: dedupedAssessments.length,
    withNonDefaultRationale: withRationale.length,
  });

  const merged = findings.map((f) => {
    const cId = f.canonical_finding_id ?? `LEGACY-${f.article_id}-${f.start_offset_global ?? 0}-${f.end_offset_global ?? 0}`;
    const a = byId.get(cId);
    if (!a) return f;
    const primaryArticle = chooseSafePrimaryArticle(a.primary_article_id, f);
    const related = normalizeRelated(f.related_article_ids ?? [], primaryArticle);
    const rationale = (a.rationale_ar && a.rationale_ar.trim() !== "")
      ? a.rationale_ar
      : (f.rationale_ar && f.rationale_ar.trim() !== "")
        ? f.rationale_ar
        : AUDITOR_RATIONALE_DEFAULT;
    const mergedTitle = a.title_ar ?? f.title_ar;
    const title_ar = normalizeMisusedGlossaryPassTitle({
      titleAr: mergedTitle,
      rationaleAr: rationale,
      detectionPass: (f as { detection_pass?: string }).detection_pass ?? null,
      evidenceSnippet: f.evidence_snippet ?? "",
      articleId: primaryArticle,
    });
    return {
      ...f,
      canonical_finding_id: cId,
      title_ar,
      final_ruling: a.final_ruling ?? f.final_ruling ?? "needs_review",
      rationale_ar: rationale,
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

  const needRationale = new Map<string, {
    title_ar: string;
    evidence_snippet: string;
    final_ruling: string;
    primary_article_id: number;
    weak_rationale: string | null;
  }>();
  for (const m of merged) {
    const id = m.canonical_finding_id ?? "";
    if (!id || needRationale.has(id)) continue;
    const primaryArticle = m.primary_article_id ?? m.article_id;
    if (!isWeakRationaleText(m.rationale_ar) && !hasExplicitArticleMismatch(m.rationale_ar, primaryArticle)) continue;
    needRationale.set(id, {
      title_ar: m.title_ar || "مخالفة محتوى",
      evidence_snippet: m.evidence_snippet || "",
      final_ruling: m.final_ruling ?? "violation",
      primary_article_id: primaryArticle,
      weak_rationale: m.rationale_ar ?? null,
    });
  }
  const rationaleItems = [...needRationale.entries()].map(([canonical_finding_id, v]) => ({
    canonical_finding_id,
    ...v,
  }));

  if (rationaleItems.length > 0) {
    const model = config.OPENAI_RATIONALE_MODEL;
    const generatedByCId = new Map<string, string>();
    try {
      for (let i = 0; i < rationaleItems.length; i += RATIONALE_ONLY_BATCH_SIZE) {
        const batch = rationaleItems.slice(i, i + RATIONALE_ONLY_BATCH_SIZE);
        const results = await callRationaleOnly(batch, model, { signal: args.signal });
        for (const r of results) {
          if (r.rationale_ar && r.rationale_ar.trim() !== "") generatedByCId.set(r.canonical_finding_id, r.rationale_ar.trim());
        }
      }
      logger.info("Rationale-only pass", { model, requested: rationaleItems.length, generated: generatedByCId.size });
      if (generatedByCId.size === 0) {
        logger.warn("Rationale-only pass returned no rationales; consider OPENAI_RATIONALE_MODEL=gpt-4o or check logs for parse errors");
      }
    } catch (err) {
      if (
        (err instanceof Error && (err.name === "AbortError" || err.name === "ChunkTimeoutError")) ||
        args.signal?.aborted
      ) {
        throw err;
      }
      logger.warn("Rationale-only pass failed, keeping default rationale", { model, error: String(err) });
    }
    if (generatedByCId.size > 0) {
      return merged.map((m) => {
        const id = m.canonical_finding_id ?? "";
        const gen = id ? generatedByCId.get(id) : undefined;
        if (!gen) return m;
        const title_ar = normalizeMisusedGlossaryPassTitle({
          titleAr: m.title_ar,
          rationaleAr: gen,
          detectionPass: (m as { detection_pass?: string }).detection_pass ?? null,
          evidenceSnippet: m.evidence_snippet ?? "",
          articleId: m.primary_article_id ?? m.article_id,
        });
        return { ...m, rationale_ar: gen, title_ar };
      });
    }
  }

  return merged;
}
