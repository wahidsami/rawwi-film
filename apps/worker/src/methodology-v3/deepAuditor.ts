import { config } from "../config.js";
import { normalizeMisusedGlossaryPassTitle } from "../findingTitleNormalize.js";
import { callAuditorRaw, callRationaleOnly, parseAuditorWithRepair } from "../openai.js";
import { logger } from "../logger.js";
import type { AuditorAssessment } from "../schemas.js";
import type { HybridFindingLike } from "./contextArbiter.js";
import { shouldSkipDeepAuditorForJob } from "../performanceGating.js";

const AUDITOR_RATIONALE_DEFAULT = "يتطلب تقييم مراجع مختص.";
const RATIONALE_ONLY_BATCH_SIZE = 6;
const QUOTE_PATTERNS = [
  /"([^"\n]{2,220})"/gu,
  /“([^”\n]{2,220})”/gu,
  /‘([^’\n]{2,220})’/gu,
  /«([^»\n]{2,220})»/gu,
];

type CanonicalCandidate = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  article_id: number;
  atom_id: string | null;
  canonical_atom?: string | null;
  primary_article_id: number;
  related_article_ids: number[];
  detection_passes?: string[];
  pillar_id?: string;
  depiction_type?: string | null;
  speaker_role?: string | null;
  narrative_consequence?: string | null;
  final_ruling_hint?: string | null;
  context_confidence?: number | null;
  policy_hint_rationale?: string | null;
};

type SceneDescriptor = {
  sceneIndex: number;
  startOffset: number;
  endOffset: number;
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

function isExactEvidenceInText(fullText: string | null, evidenceSnippet: string | null | undefined): boolean {
  const text = (fullText ?? "").trim();
  const evidence = (evidenceSnippet ?? "").trim();
  if (!text || !evidence) return false;
  return text.includes(evidence);
}

function compactSpace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value: string | null | undefined): string {
  return compactSpace(value).normalize("NFC");
}

function tokenizeEvidence(value: string | null | undefined): string[] {
  return normalizeForCompare(value).split(/\s+/).filter(Boolean);
}

function hasWomenSpecificEvidence(value: string | null | undefined): boolean {
  const text = normalizeForCompare(value);
  if (!text) return false;
  return (
    /(امرأ|المرأة|نساء|زوجة|زوجتك|بنت|البنت|بنات|أنثى|مطبخ|السرير|البيت)/u.test(text) ||
    /(ما\s+لك\s+كلمة|مالك\s+كلمة|ما\s+لها\s+كلمة|مكانك\s+المطبخ|مكان\s+البنت|مكانها\s+البيت|للمطبخ\s+والسرير|للمطبخ|السرير\s+وبس)/u.test(text)
  );
}

function hasViolenceKeywordEvidence(value: string | null | undefined): boolean {
  const text = normalizeForCompare(value);
  if (!text) return false;
  return /(ضرب|أضرب|بضرب|يضر|قتل|أقتل|بقتل|ذبح|طعن|ركل|صفع|دفع|عنف|يعنف|يعنفني|يضربني|بقتلك|جزمة|عصا|مسدس|سكين|دم)/u.test(text);
}

function hasPassSpecificEvidenceProblem(finding: HybridFindingLike): boolean {
  const pass = String((finding as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase();
  const atom = String((finding as { canonical_atom?: string | null }).canonical_atom ?? "").trim().toUpperCase();
  const articleId = finding.article_id ?? 0;
  const evidence = finding.evidence_snippet ?? "";

  if ((pass === "women" || articleId === 7 || atom === "WOMEN") && !hasWomenSpecificEvidence(evidence)) {
    return true;
  }

  if ((pass === "violence" || articleId === 9 || atom === "VIOLENCE") && tokenizeEvidence(evidence).length === 1 && !hasViolenceKeywordEvidence(evidence)) {
    return true;
  }

  return false;
}

function extractQuotedNeedles(value: string | null | undefined): string[] {
  const source = String(value ?? "");
  const seen = new Set<string>();
  for (const pattern of QUOTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const text = compactSpace(match[1] ?? "");
      if (text.length >= 3) seen.add(text);
    }
  }
  return [...seen];
}

function rationaleQuotesDifferentEvidence(rationale: string | null | undefined, evidenceSnippet: string | null | undefined): boolean {
  const evidence = normalizeForCompare(evidenceSnippet);
  if (!evidence) return false;
  const quoted = extractQuotedNeedles(rationale);
  if (quoted.length === 0) return false;
  return quoted.some((needle) => {
    const normalizedNeedle = normalizeForCompare(needle);
    if (!normalizedNeedle) return false;
    return !evidence.includes(normalizedNeedle) && !normalizedNeedle.includes(evidence);
  });
}

function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function buildSceneIndex(fullText: string | null): SceneDescriptor[] {
  const text = (fullText ?? "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headings: Array<{ startOffset: number; heading: string }> = [];
  let cursor = 0;
  for (const rawLine of lines) {
    const heading = compactSpace(rawLine);
    if (
      heading &&
      heading.length <= 96 &&
      !/:/.test(heading) &&
      (
        /^(?:المشهد|مشهد)\s*[\d\u0660-\u0669]+/u.test(heading) ||
        /^(?:INT\.|EXT\.|I\/E\.|INT\/EXT|\.INT|\.EXT)\b/i.test(heading) ||
        /^(?:[.٠-٩0-9]+\s+)?(?:المشهد|مشهد|الفصل|الطريق|منزل|سيارة)\b/u.test(heading) ||
        (
          /(?:\bداخلي\b|\bخارجي\b|\/ليلي|\/نهاري|- خارجي|- داخلي|-خارجي|-داخلي)/u.test(heading) &&
          !/[.!؟،؛]/u.test(heading)
        )
      )
    ) {
      headings.push({ startOffset: cursor, heading });
    }
    cursor += rawLine.length + 1;
  }
  return headings.map((heading, index) => ({
    sceneIndex: index + 1,
    startOffset: heading.startOffset,
    endOffset: headings[index + 1]?.startOffset ?? text.length,
  }));
}

function resolveSceneIndexAtOffset(fullText: string | null, offset: number | null | undefined): number | null {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return null;
  const scenes = buildSceneIndex(fullText);
  if (scenes.length === 0) return null;
  return scenes.find((scene) => offset >= scene.startOffset && offset < scene.endOffset)?.sceneIndex ?? scenes[scenes.length - 1]?.sceneIndex ?? null;
}

function extractSceneNumbersFromRationale(value: string | null | undefined): number[] {
  const text = toAsciiDigits(String(value ?? ""));
  const matches = [...text.matchAll(/(?:المشهد|مشهد|scene)\s+(\d+)/giu)];
  return matches
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num));
}

function rationaleMentionsDifferentScene(
  rationale: string | null | undefined,
  fullText: string | null,
  startOffsetGlobal: number | null | undefined,
): boolean {
  const mentioned = extractSceneNumbersFromRationale(rationale);
  if (mentioned.length === 0) return false;
  const resolved = resolveSceneIndexAtOffset(fullText, startOffsetGlobal);
  if (resolved == null) return false;
  return !mentioned.includes(resolved);
}

const ARTICLE_FOUR_DEFER_PASS_NAMES = new Set([
  "insults",
  "violence",
  "women",
  "discrimination_incitement",
  "misinformation",
]);

function spansOverlapEnough(a: HybridFindingLike, b: HybridFindingLike, minRatio = 0.6): boolean {
  const aStart = a.start_offset_global ?? 0;
  const aEnd = a.end_offset_global ?? aStart;
  const bStart = b.start_offset_global ?? 0;
  const bEnd = b.end_offset_global ?? bStart;
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const aLen = Math.max(0, aEnd - aStart);
  const bLen = Math.max(0, bEnd - bStart);
  if (aLen === 0 || bLen === 0) return false;
  return overlap / Math.min(aLen, bLen) >= minRatio;
}

function shouldDropArticleFourForSpecificOwner(
  candidate: HybridFindingLike,
  allFindings: HybridFindingLike[],
): boolean {
  if ((candidate.article_id ?? 0) !== 4) return false;

  const candidatePass = String((candidate as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase();
  if (!candidatePass) return false;

  const candidateEvidence = normalizeForCompare(candidate.evidence_snippet);
  return allFindings.some((other) => {
    if (other === candidate) return false;
    if ((other.article_id ?? 0) === 4) return false;

    const otherPass = String((other as { detection_pass?: string }).detection_pass ?? "").trim().toLowerCase();
    if (!ARTICLE_FOUR_DEFER_PASS_NAMES.has(otherPass)) return false;

    const otherEvidence = normalizeForCompare(other.evidence_snippet);
    const sameEvidence =
      candidateEvidence.length >= 3 &&
      otherEvidence.length >= 3 &&
      (candidateEvidence.includes(otherEvidence) || otherEvidence.includes(candidateEvidence));

    return sameEvidence || spansOverlapEnough(candidate, other);
  });
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
      article_id: primary.article_id,
      atom_id: primary.atom_id ?? null,
      canonical_atom: canonicalAtomForFinding(primary),
      primary_article_id: primaryArticle,
      related_article_ids: related,
      detection_passes: [
        ...new Set(
          list
            .map((x) => (x as { detection_pass?: string }).detection_pass)
            .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        ),
      ],
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
  if (candidates.length > 0 && dedupedAssessments.length === 0) {
    logger.warn("Deep auditor returned zero assessments; falling back to pre-auditor findings", {
      candidateCount: candidates.length,
      model: config.OPENAI_AUDITOR_MODEL,
    });
    return findings;
  }
  const byId = new Map(dedupedAssessments.map((a) => [a.canonical_finding_id, a]));

  const withRationale = dedupedAssessments.filter(
    (a) => !isWeakRationaleText(a.rationale_ar)
  );
  logger.info("Auditor assessments rationale stats", {
    total: dedupedAssessments.length,
    withNonDefaultRationale: withRationale.length,
  });

  const merged: HybridFindingLike[] = [];
  for (const f of findings) {
    const cId = f.canonical_finding_id ?? `LEGACY-${f.article_id}-${f.start_offset_global ?? 0}-${f.end_offset_global ?? 0}`;
    const a = byId.get(cId);
    if (!a) continue;
    const primaryArticle = basePrimaryArticleForFinding(f);
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
    merged.push({
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
    });
  }

  const filteredMerged = merged.filter((finding) => {
    const exactEvidence = isExactEvidenceInText(fullText, finding.evidence_snippet);
    if (!exactEvidence) return false;
    if (isWeakRationaleText(finding.rationale_ar) && finding.final_ruling === "violation") return false;
    if (shouldDropArticleFourForSpecificOwner(finding, merged)) return false;
    if (hasPassSpecificEvidenceProblem(finding)) return false;
    return true;
  });

  logger.info("Deep auditor filter stats", {
    beforeAuditor: findings.length,
    auditorAcceptedCanonical: dedupedAssessments.length,
    afterAuditorKeepList: merged.length,
    afterDeterministicFilter: filteredMerged.length,
    droppedByAuditorOmission: findings.length - merged.length,
    droppedByDeterministicFilter: merged.length - filteredMerged.length,
  });

  const needRationale = new Map<string, {
    title_ar: string;
    evidence_snippet: string;
    final_ruling: string;
    primary_article_id: number;
    weak_rationale: string | null;
  }>();
  let weakRationaleCount = 0;
  let articleMismatchCount = 0;
  let quotedEvidenceMismatchCount = 0;
  let sceneMismatchCount = 0;
  for (const m of filteredMerged) {
    const id = m.canonical_finding_id ?? "";
    if (!id || needRationale.has(id)) continue;
    const primaryArticle = m.primary_article_id ?? m.article_id;
    const weakRationale = isWeakRationaleText(m.rationale_ar);
    const articleMismatch = hasExplicitArticleMismatch(m.rationale_ar, primaryArticle);
    const quotedEvidenceMismatch = rationaleQuotesDifferentEvidence(m.rationale_ar, m.evidence_snippet);
    const sceneMismatch = rationaleMentionsDifferentScene(
      m.rationale_ar,
      fullText,
      m.start_offset_global ?? null,
    );
    if (!weakRationale && !articleMismatch && !quotedEvidenceMismatch && !sceneMismatch) continue;
    if (weakRationale) weakRationaleCount++;
    if (articleMismatch) articleMismatchCount++;
    if (quotedEvidenceMismatch) quotedEvidenceMismatchCount++;
    if (sceneMismatch) sceneMismatchCount++;
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
  logger.info("Rationale rewrite triggers", {
    total: rationaleItems.length,
    weakRationaleCount,
    articleMismatchCount,
    quotedEvidenceMismatchCount,
    sceneMismatchCount,
  });

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
      return filteredMerged.map((m) => {
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

  return filteredMerged;
}
