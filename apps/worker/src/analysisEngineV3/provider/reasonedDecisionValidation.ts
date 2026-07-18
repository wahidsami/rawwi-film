import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ProviderReasoningResult, V3ReasonedDecisionArticleEvaluation, V3ReasonedDecisionResult } from "./providerTypes.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";

export type V3ReasonedDecisionValidationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
  severity?: "error" | "recoverable";
  details?: Readonly<Record<string, unknown>>;
}>;

export type V3ReasonedDecisionValidationResult = Readonly<{
  valid: boolean;
  issues: readonly V3ReasonedDecisionValidationIssue[];
  validationNote: string;
  sanitizedDecision: V3ReasonedDecisionResult;
}>;

const GENERIC_EXPLANATORY_TOKENS = new Set([
  "a",
  "ability",
  "according",
  "analysis",
  "and",
  "atom",
  "candidate",
  "article",
  "articles",
  "authoritative",
  "because",
  "before",
  "but",
  "case",
  "cause",
  "commentary",
  "could",
  "confidence",
  "context",
  "conclusion",
  "directly",
  "counter",
  "counterargument",
  "counterevidence",
  "decision",
  "deterministic",
  "dialogue",
  "direct",
  "exact",
  "exception",
  "exceptions",
  "evidence",
  "explicit",
  "explanation",
  "finding",
  "facts",
  "engine",
  "grounded",
  "human",
  "in",
  "inside",
  "interpretations",
  "interpretation",
  "kept",
  "keeping",
  "legal",
  "language",
  "likely",
  "line",
  "literal",
  "low",
  "no",
  "risk",
  "semantic",
  "object",
  "objects",
  "one",
  "reading",
  "quote",
  "quoted",
  "quotes",
  "real",
  "recommendation",
  "regenerate",
  "reviewer",
  "scene",
  "single",
  "selected",
  "support",
  "supported",
  "supports",
  "supporting",
  "straightforward",
  "story",
  "text",
  "the",
  "this",
  "deterministic",
  "provided",
  "supplied",
  "returned",
  "return",
  "treat",
  "treating",
  "to",
  "true",
  "unambiguous",
  "unlikely",
  "violation",
  "while",
  "when",
  "why",
  "within",
  "injury",
  "injuries",
  "actor",
  "actors",
  "event",
  "events",
  "object",
  "objects",
  "current",
  "sufficient",
  "insufficient",
  "insufficiently",
  "grounded",
  "nonhallucinatory",
  "hallucination",
  "profanity",
  "religion",
  "religious",
  "politics",
  "political",
  "security",
  "national",
  "state",
  "leadership",
  "children",
  "violence",
  "sexual",
  "drugs",
  "society",
  "family",
  "history",
  "crime",
  "travel",
  "attack",
  "attacks",
  "hostile",
  "blocking",
  "commentary",
  "conclusion",
  "would",
  "with",
  "cues",
  // Common Arabic explanatory / legal narration vocabulary that should not be
  // mistaken for hallucinated factual content when it merely paraphrases the quote.
  "يحتوي",
  "حوار",
  "حواراً",
  "إدانة",
  "وإدانة",
  "الزوجة",
  "عائلية",
  "عائلي",
  "بالعنف",
  "العنف",
  "الأسري",
  "الاسري",
  "تحذر",
  "تحذير",
  "تصاعد",
  "خطورة",
  "الإضرار",
  "الاضرار",
  "النسيج",
  "الاجتماعي",
  "الاجتماعية",
  "القتل",
  "المساس",
  "الثوابت",
  "الدينية",
  "التفسير",
  "تفسيرية",
  "ملاحظة",
  "آلي",
  "تحليل",
  "ثقة",
  "صفحة",
  "المشهد",
  "الفصل",
  "داخلي",
  "شقة",
  "ضيقة",
  "ليل",
  "حاضر",
  "غادروا",
  "صمت",
  "مباشر",
  "مباشرًا",
  "واضحة",
  "النص",
  "حوارا",
  "ويصف",
  "إلى",
  "يصف",
  "داخل",
  "سياق",
  "مرتبط",
  "لكن",
  "الحكم",
  "النهائي",
  "يستند",
  "العبارة",
  "المنقولة",
  "نفسها",
  "قد",
  "مجرد",
  "أكثر",
  "وصف",
  "وصفي",
  "الاقتباس",
  "بدون",
  "وقائع",
  "جديدة",
  "عربي",
  "صفي",
  "الاساس",
  "الأساس",
  "لا",
  "أضيف",
  "الأب",
  "الاب",
  "الأم",
  "الام",
  "الابن",
  "الابنة",
  "الجار",
  "الجارة",
  "المنزل",
  "البيت",
  "الرجل",
  "المرآة",
  "المرأة",
  "quotation",
  "quoted",
  "quote",
  "educational",
  "education",
  "condemnation",
  "condemnatory",
  "historical",
  "history",
  "satire",
  "satirical",
  "dialogue",
  "narration",
  "contextual",
  "exception",
  "exceptions",
  "exempt",
  "exemption",
  "reportable",
  "policy",
  "اقتباس",
  "مقتبس",
  "تعليمي",
  "تعليمية",
  "إدانة",
  "تاريخي",
  "تاريخية",
  "سخرية",
  "حوار",
  "سرد",
  "سياقي",
  "استثناء",
  "معفى",
]);

const CONCRETE_CLAIM_TOKENS = new Set([
  "murder",
  "murdered",
  "kill",
  "killed",
  "prince",
  "palace",
  "king",
  "queen",
  "blood",
  "weapon",
  "gun",
  "knife",
  "house",
  "street",
  "car",
  "prison",
  "police",
  "attack",
  "assault",
  "victim",
  "offender",
  "أمير",
  "قصر",
  "قتل",
  "مقتل",
  "مقتول",
  "طعن",
  "سلاح",
  "بندقية",
  "سكين",
  "دم",
  "شرطة",
  "جريمة",
  "اعتداء",
  "سجن",
  "شارع",
  "سيارة",
  "منزل",
  "بيت",
]);

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function normalizeGroundingText(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/\u2026/g, "...")
    .replace(/[\u0640]/g, "")
    .replace(/[\p{M}]/gu, "")
    .replace(/[«»‹›„“”‟]/gu, " ")
    .replace(/[،؛؟]/gu, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeIdSet(values: readonly string[] | null | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map((value) => normalizeText(value)).filter((value) => value.length > 0));
}

function parsePolicyArticleId(articleId: string): number {
  const numeric = Number.parseInt(articleId.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function candidateReferenceTokenVariants(value: string): readonly string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const compact = normalized.replace(/\s+/g, "");
  if (compact.length > 0) variants.add(compact);
  const hyphenated = normalized.replace(/\s+/g, "-");
  if (hyphenated.length > 0) variants.add(hyphenated);
  const underscored = normalized.replace(/\s+/g, "_");
  if (underscored.length > 0) variants.add(underscored);

  if (/^\d+$/.test(normalized)) {
    variants.add(`article ${normalized}`);
    variants.add(`article-${normalized}`);
    variants.add(`article_${normalized}`);
    variants.add(`article${normalized}`);
  }

  return [...variants];
}

function buildCandidateReferenceTokenSet(values: readonly string[]): ReadonlySet<string> {
  return new Set(values.flatMap((value) => candidateReferenceTokenVariants(value)));
}

function logValidationRejection(input: V3PromptBuilderInput, result: V3ProviderReasoningResult, issues: readonly V3ReasonedDecisionValidationIssue[], candidateArticleIds: ReadonlySet<string>, candidateAtomIds: ReadonlySet<string>, candidateReviewerIds: ReadonlySet<string>, candidateReviewerLabels: ReadonlySet<string>): void {
  logger.warn("V3 reasoned decision validation rejected", {
    validator_name: "reasonedDecisionValidation",
    candidate_reviewers: [...candidateReviewerIds],
    candidate_reviewer_labels: [...candidateReviewerLabels],
    candidate_articles: [...candidateArticleIds],
    candidate_atoms: [...candidateAtomIds],
    gpt_reviewer: input.subjectModule.id,
    gpt_articles: [...new Set(result.reasonedDecision.articleEvaluations.map((evaluation) => String(evaluation.articleId)))],
    gpt_atoms: [...new Set([
      ...(result.reasonedDecision.reasoning.match(/\b(?:atom[_-]?\d+(?:[_-]\d+)*|\d+-\d+)\b/gi) ?? []),
      ...(result.reasonedDecision.narrativeAnalysis.match(/\b(?:atom[_-]?\d+(?:[_-]\d+)*|\d+-\d+)\b/gi) ?? []),
      ...(result.reasonedDecision.humanLikeExplanation.match(/\b(?:atom[_-]?\d+(?:[_-]\d+)*|\d+-\d+)\b/gi) ?? []),
      ...(result.reasonedDecision.recommendation.match(/\b(?:atom[_-]?\d+(?:[_-]\d+)*|\d+-\d+)\b/gi) ?? []),
    ])],
    rejection_reason: issues.map((issue) => `${issue.code}:${issue.path}`).join(" | "),
    line_of_code: "reasonedDecisionValidation.ts:252-334",
    issue_messages: issues.map((issue) => issue.message),
  });
}

function isFatalValidationIssue(issue: V3ReasonedDecisionValidationIssue): boolean {
  return (issue.severity ?? "error") === "error";
}

function serializeIssueDetails(issue: V3ReasonedDecisionValidationIssue): Record<string, unknown> {
  return {
    code: issue.code,
    path: issue.path,
    message: issue.message,
    severity: issue.severity ?? "error",
    ...(issue.details ?? {}),
  };
}

function splitTokens(value: string): readonly string[] {
  return normalizeGroundingText(value)
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.toLowerCase())
    .filter((token) => token.length > 0) ?? [];
}

function splitSentences(value: string): readonly string[] {
  return normalizeGroundingText(value)
    .split(/[.!?؟\n]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function normalizeStoryMemory(storyMemory: V3PromptBuilderInput["storyMemory"]): string {
  if (typeof storyMemory === "string") {
    return storyMemory;
  }

  if (storyMemory && typeof storyMemory === "object") {
    return [
      storyMemory.summary ?? "",
      ...(storyMemory.notes ?? []),
      ...(storyMemory.scenes ?? []),
    ].join(" | ");
  }

  return "";
}

function collectGroundingCorpus(input: V3PromptBuilderInput, result: V3ProviderReasoningResult): string {
  return [
    input.chunkContext.localChunk,
    ...(input.chunkContext.neighboringSentences ?? []),
    input.chunkContext.sceneMemory ?? "",
    normalizeStoryMemory(input.storyMemory),
    result.semantic.semanticMeaning,
    result.semantic.riskContext,
    result.context.localContext,
    result.context.narrativeContext,
    ...result.evidence.candidates.flatMap((candidate) => [candidateText(candidate), candidate.text ?? ""]),
  ].join(" | ");
}

function collectGroundingTokens(input: V3PromptBuilderInput, result: V3ProviderReasoningResult): ReadonlySet<string> {
  return new Set(splitTokens(collectGroundingCorpus(input, result)));
}

function candidateText(candidate: V3ProviderReasoningResult["evidence"]["candidates"][number]): string {
  const quote = (candidate as { quote?: string }).quote;
  return typeof quote === "string" ? quote : "";
}

type GroundingEvidenceCandidate = Readonly<{
  index: number;
  quote: string;
  quoteNormalized: string;
  extractedSpan: string;
  extractedSpanNormalized: string;
  startOffset: number | null;
  endOffset: number | null;
}>;

function extractChunkSpanText(input: V3PromptBuilderInput, startOffset: number | null | undefined, endOffset: number | null | undefined): string {
  const chunkText = input.chunkContext.localChunk ?? "";
  if (typeof startOffset !== "number" || typeof endOffset !== "number") return "";
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) return "";
  if (startOffset < 0 || endOffset <= startOffset || endOffset > chunkText.length) return "";
  return chunkText.slice(startOffset, endOffset);
}

function buildGroundingEvidenceCandidates(input: V3PromptBuilderInput, result: V3ProviderReasoningResult): readonly GroundingEvidenceCandidate[] {
  return result.evidence.candidates.map((candidate, index) => {
    const quote = String((candidateText(candidate) || candidate.text) ?? "").trim();
    const extractedSpan = extractChunkSpanText(input, candidate.startOffset, candidate.endOffset).trim();
    return Object.freeze({
      index,
      quote,
      quoteNormalized: normalizeGroundingText(quote),
      extractedSpan,
      extractedSpanNormalized: normalizeGroundingText(extractedSpan),
      startOffset: typeof candidate.startOffset === "number" ? candidate.startOffset : null,
      endOffset: typeof candidate.endOffset === "number" ? candidate.endOffset : null,
    });
  });
}

type GroundingEvidenceMatch = Readonly<{
  matched: boolean;
  matchedBy: "exact_normalized_quote" | "exact_extracted_span" | "source_offsets" | "contained_within_extracted_span" | "contained_within_quote" | null;
  matchedSpan: string | null;
  matchedSpanIndex: number | null;
  matchedStartOffset: number | null;
  matchedEndOffset: number | null;
  normalizedEvidence: string;
}>;

function matchGroundingEvidenceItem(
  evidence: string,
  candidates: readonly GroundingEvidenceCandidate[],
): GroundingEvidenceMatch {
  const normalizedEvidence = normalizeGroundingText(evidence);
  if (normalizedEvidence.length === 0) {
    return Object.freeze({
      matched: false,
      matchedBy: null,
      matchedSpan: null,
      matchedSpanIndex: null,
      matchedStartOffset: null,
      matchedEndOffset: null,
      normalizedEvidence,
    });
  }

  for (const candidate of candidates) {
    if (candidate.quoteNormalized.length > 0 && normalizedEvidence === candidate.quoteNormalized) {
      return Object.freeze({
        matched: true,
        matchedBy: "exact_normalized_quote",
        matchedSpan: candidate.quote || candidate.extractedSpan || null,
        matchedSpanIndex: candidate.index,
        matchedStartOffset: candidate.startOffset,
        matchedEndOffset: candidate.endOffset,
        normalizedEvidence,
      });
    }

    if (candidate.extractedSpanNormalized.length > 0 && normalizedEvidence === candidate.extractedSpanNormalized) {
      return Object.freeze({
        matched: true,
        matchedBy: candidate.startOffset !== null && candidate.endOffset !== null ? "source_offsets" : "exact_extracted_span",
        matchedSpan: candidate.extractedSpan || candidate.quote || null,
        matchedSpanIndex: candidate.index,
        matchedStartOffset: candidate.startOffset,
        matchedEndOffset: candidate.endOffset,
        normalizedEvidence,
      });
    }

    if (candidate.extractedSpanNormalized.length > 0 && candidate.extractedSpanNormalized.includes(normalizedEvidence)) {
      return Object.freeze({
        matched: true,
        matchedBy: "contained_within_extracted_span",
        matchedSpan: candidate.extractedSpan || candidate.quote || null,
        matchedSpanIndex: candidate.index,
        matchedStartOffset: candidate.startOffset,
        matchedEndOffset: candidate.endOffset,
        normalizedEvidence,
      });
    }

    if (candidate.quoteNormalized.length > 0 && candidate.quoteNormalized.includes(normalizedEvidence)) {
      return Object.freeze({
        matched: true,
        matchedBy: "contained_within_quote",
        matchedSpan: candidate.quote || candidate.extractedSpan || null,
        matchedSpanIndex: candidate.index,
        matchedStartOffset: candidate.startOffset,
        matchedEndOffset: candidate.endOffset,
        normalizedEvidence,
      });
    }
  }

  return Object.freeze({
    matched: false,
    matchedBy: null,
    matchedSpan: null,
    matchedSpanIndex: null,
    matchedStartOffset: null,
    matchedEndOffset: null,
    normalizedEvidence,
  });
}

function buildNoViolationDecision(
  input: V3PromptBuilderInput,
  result: V3ProviderReasoningResult,
): V3ReasonedDecisionResult {
  const primaryEvidence = result.evidence.candidates[result.evidence.primaryCandidateIndex ?? 0] ?? result.evidence.candidates[0] ?? null;
  const primaryQuote = primaryEvidence ? candidateText(primaryEvidence) : "";
  const primaryText = primaryEvidence?.text ?? "";
  const supportingEvidence = primaryQuote || primaryText
    ? [primaryQuote || primaryText]
    : [];

  return Object.freeze({
    ...result.reasonedDecision,
    reasoning: "NO DETECTION",
    alternativeInterpretations: Object.freeze([]),
    confidence: Math.min(result.reasonedDecision.confidence, result.semantic.confidence, result.evidence.confidence, result.context.confidence, 0.5),
    supportingEvidence: Object.freeze(supportingEvidence),
    contradictingEvidence: Object.freeze([]),
    applicableArticles: Object.freeze([]),
    rejectedArticles: Object.freeze([...new Set([
      ...result.reasonedDecision.rejectedArticles,
      ...(result.reasonedDecision.applicableArticles ?? []),
      ...(input.subjectModule.articleIds ?? []),
    ])].sort((left, right) => left - right)),
    riskAnalysis: "Insufficient grounded evidence. Conservative no-detection fallback.",
    narrativeAnalysis: "Insufficient grounded evidence.",
    humanLikeExplanation: "NO DETECTION",
    recommendation: "NO DETECTION",
  });
}

function evaluationKey(evaluation: V3ReasonedDecisionArticleEvaluation): string {
  return `${normalizeText(String(evaluation.articleId))}::${normalizeText(evaluation.reason)}::${normalizeText(evaluation.evidence.join(" | "))}::${normalizeText(evaluation.status)}`;
}

type FactualClaimDiagnostic = Readonly<{
  sentence: string;
  unsupportedVocabularyTokens: readonly string[];
  supportRatio: number;
  reason: string;
}>;

function sentenceHasExactGrounding(
  sentence: string,
  exactEvidenceTexts: ReadonlySet<string>,
  candidateArticleTokens: ReadonlySet<string>,
  candidateAtomTokens: ReadonlySet<string>,
  candidateReviewerTokens: ReadonlySet<string>,
): boolean {
  const normalizedSentence = normalizeGroundingText(sentence);
  if (normalizedSentence.length === 0) return true;
  if (exactEvidenceTexts.has(normalizedSentence)) return true;
  if (candidateArticleTokens.has(normalizedSentence)) return true;
  if (candidateAtomTokens.has(normalizedSentence)) return true;
  if (candidateReviewerTokens.has(normalizedSentence)) return true;

  for (const evidenceText of exactEvidenceTexts) {
    if (evidenceText.length > 0 && normalizedSentence.includes(evidenceText)) return true;
  }

  return false;
}

function assessFactualClaimGrounding(
  sentence: string,
  groundingTokens: ReadonlySet<string>,
  exactEvidenceTexts: ReadonlySet<string>,
  candidateArticleTokens: ReadonlySet<string>,
  candidateAtomTokens: ReadonlySet<string>,
  candidateReviewerTokens: ReadonlySet<string>,
): FactualClaimDiagnostic | null {
  const normalizedGroundedSentence = normalizeGroundingText(sentence);
  if (normalizedGroundedSentence.length === 0) return null;
  if (sentenceHasExactGrounding(sentence, exactEvidenceTexts, candidateArticleTokens, candidateAtomTokens, candidateReviewerTokens)) {
    return null;
  }

  const tokens = splitTokens(sentence);
  if (tokens.length === 0) return null;

  const unsupportedVocabularyTokens = tokens.filter((token) =>
    token.length >= 3 &&
    !groundingTokens.has(token) &&
    !candidateArticleTokens.has(token) &&
    !candidateAtomTokens.has(token) &&
    !candidateReviewerTokens.has(token) &&
    !GENERIC_EXPLANATORY_TOKENS.has(token)
  );

  const supportTokens = tokens.filter((token) =>
    groundingTokens.has(token) ||
    candidateArticleTokens.has(token) ||
    candidateAtomTokens.has(token) ||
    candidateReviewerTokens.has(token) ||
    GENERIC_EXPLANATORY_TOKENS.has(token)
  );

  const supportRatio = supportTokens.length / Math.max(1, tokens.length);
  const concreteClaimTokens = unsupportedVocabularyTokens.filter((token) => CONCRETE_CLAIM_TOKENS.has(token));
  if (concreteClaimTokens.length === 0 || supportRatio >= 0.6) return null;

  return Object.freeze({
    sentence,
    unsupportedVocabularyTokens: Object.freeze([...new Set(unsupportedVocabularyTokens)]),
    supportRatio,
    reason: concreteClaimTokens.length > 0
      ? "The sentence introduces concrete factual content that is not grounded in the quoted evidence, current scene, candidate articles, candidate atoms, or reviewer scope."
      : "The sentence introduces factual content that is not grounded in the quoted evidence, current scene, candidate articles, candidate atoms, or reviewer scope.",
  });
}

function createValidationIssue(
  code: string,
  path: string,
  message: string,
  severity: "error" | "recoverable" = "error",
  details?: Readonly<Record<string, unknown>>,
): V3ReasonedDecisionValidationIssue {
  return Object.freeze({
    code,
    path,
    message,
    severity,
    ...(details ? { details } : {}),
  });
}

function isStabilizationRecoverableIssue(code: string): boolean {
  if (!config.V3_STABILIZATION_MODE) return false;
  return code === "article_outside_candidate_set" || code === "atom_outside_candidate_set" || code === "unsupported_factual_claim";
}

export function validateReasonedDecisionAgainstEvidence(
  input: V3PromptBuilderInput,
  result: V3ProviderReasoningResult,
): V3ReasonedDecisionValidationResult {
  const issues: V3ReasonedDecisionValidationIssue[] = [];
  const compiledReviewerContext = input.compiledReviewerContext ?? null;
  const candidateDiagnostics = compiledReviewerContext?.candidateDiagnostics ?? null;
  const candidateReviewerIds = normalizeIdSet(compiledReviewerContext?.selection.selectedReviewerIds);
  const candidateReviewerLabels = normalizeIdSet(compiledReviewerContext?.selection.selectedReviewerLabels);
  const groundingTokens = collectGroundingTokens(input, result);
  const groundingEvidenceCandidates = buildGroundingEvidenceCandidates(input, result);
  const exactEvidenceTexts = new Set(
    groundingEvidenceCandidates
      .flatMap((candidate) => [candidate.quoteNormalized, candidate.extractedSpanNormalized])
      .filter((text) => text.length > 0),
  );

  const candidateArticleIds = normalizeIdSet(
    candidateDiagnostics?.articleRanking.selectedPolicyArticleIds.length
      ? candidateDiagnostics.articleRanking.selectedPolicyArticleIds.map((articleId) => String(articleId))
      : compiledReviewerContext?.selectedPolicyArticleIds?.length
        ? compiledReviewerContext.selectedPolicyArticleIds.map((articleId) => String(articleId))
        : compiledReviewerContext?.selectedArticles.map((article) => {
            const policyArticleId = parsePolicyArticleId(article.articleId);
            return policyArticleId > 0 ? String(policyArticleId) : article.articleId;
          }),
  );
  const candidateAtomIds = normalizeIdSet(
    candidateDiagnostics?.atomRanking.selectedPolicyAtomIds
      ?? compiledReviewerContext?.selectedAtoms.map((atom) => atom.atomId),
  );
  const candidateArticleTokens = buildCandidateReferenceTokenSet([...candidateArticleIds]);
  const candidateAtomTokens = buildCandidateReferenceTokenSet([...candidateAtomIds]);
  const candidateReviewerTokens = buildCandidateReferenceTokenSet([...candidateReviewerIds, ...candidateReviewerLabels]);
  logger.info("V3 reasoned decision validation candidate set", {
    validator_name: "reasonedDecisionValidation",
    candidate_reviewers: [...candidateReviewerIds],
    candidate_reviewer_labels: [...candidateReviewerLabels],
    candidate_articles: [...candidateArticleIds],
    candidate_atoms: [...candidateAtomIds],
    gpt_articles: [...new Set(result.reasonedDecision.articleEvaluations.map((evaluation) => String(evaluation.articleId)))],
    gpt_recommendation: result.reasonedDecision.recommendation,
  });
  const acceptedEvaluations: V3ReasonedDecisionArticleEvaluation[] = [];
  const rejectedEvaluationRecords: Array<Readonly<{
    index: number;
    evaluation: V3ReasonedDecisionArticleEvaluation;
    issues: readonly V3ReasonedDecisionValidationIssue[];
  }>> = [];
  const sharedClaimSources = [
    result.reasonedDecision.reasoning,
    ...result.reasonedDecision.alternativeInterpretations,
    result.reasonedDecision.riskAnalysis,
    result.reasonedDecision.narrativeAnalysis,
    result.reasonedDecision.humanLikeExplanation,
  ];

  for (const [index, evaluation] of result.reasonedDecision.articleEvaluations.entries()) {
    const evaluationIssues: V3ReasonedDecisionValidationIssue[] = [];
    const evaluationPath = `reasonedDecision.articleEvaluations[${index}]`;
    const evaluationArticleId = normalizeText(String(evaluation.articleId));
    const acceptedEvaluationEvidence: string[] = [];

    if (candidateArticleIds.size > 0 && !candidateArticleIds.has(evaluationArticleId)) {
      const issue = createValidationIssue(
        "article_outside_candidate_set",
        `${evaluationPath}.articleId`,
        `The reviewer returned article ${evaluation.articleId}, but it was not supplied in the candidate article set.`,
        isStabilizationRecoverableIssue("article_outside_candidate_set") ? "recoverable" : "error",
      );
      issues.push(issue);
      evaluationIssues.push(issue);
    }

    for (const [evidenceIndex, evidence] of evaluation.evidence.entries()) {
      const normalizedEvidence = normalizeGroundingText(evidence);
      const evidenceMatch = matchGroundingEvidenceItem(evidence, groundingEvidenceCandidates);
      if (normalizedEvidence.length > 0 && evidenceMatch.matched) {
        acceptedEvaluationEvidence.push(String(evidence).normalize("NFC").replace(/\s+/g, " ").trim());
        continue;
      }

      const issue = createValidationIssue(
        "unsupported_supporting_evidence",
        `${evaluationPath}.evidence[${evidenceIndex}]`,
        normalizedEvidence.length === 0
          ? "Supporting evidence cannot be empty."
          : `Supporting evidence must be an exact quote, an extracted span, or a contained quote, but received: ${JSON.stringify(evidence)}.`,
        "recoverable",
        {
          validatorStage: "evidence_item_grounding",
          expectedEvidence: groundingEvidenceCandidates.map((candidate) => candidate.quote || candidate.extractedSpan).filter((value): value is string => value.length > 0),
          normalizedEvidence,
          matchedSpan: evidenceMatch.matchedSpan,
          matchedSpanIndex: evidenceMatch.matchedSpanIndex,
          matchedStartOffset: evidenceMatch.matchedStartOffset,
          matchedEndOffset: evidenceMatch.matchedEndOffset,
          matchedBy: evidenceMatch.matchedBy,
          rejectionReason: normalizedEvidence.length === 0 ? "empty_evidence" : "evidence_not_grounded",
        },
      );
      issues.push(issue);
      evaluationIssues.push(issue);
      logger.warn("V3 reasoned decision evidence item rejected", {
        validator_name: "reasonedDecisionValidation",
        validator_stage: "evidence_item_grounding",
        evaluation_index: index,
        evaluation_article: evaluation.articleId,
        candidate_reviewers: [...candidateReviewerIds],
        candidate_reviewer_labels: [...candidateReviewerLabels],
        candidate_articles: [...candidateArticleIds],
        candidate_atoms: [...candidateAtomIds],
        expected_evidence: groundingEvidenceCandidates.map((candidate) => candidate.quote || candidate.extractedSpan).filter((value): value is string => value.length > 0),
        normalized_evidence: normalizedEvidence,
        matched_span: evidenceMatch.matchedSpan,
        matched_span_index: evidenceMatch.matchedSpanIndex,
        matched_start_offset: evidenceMatch.matchedStartOffset,
        matched_end_offset: evidenceMatch.matchedEndOffset,
        matched_by: evidenceMatch.matchedBy,
        rejection_reason: normalizedEvidence.length === 0 ? "empty_evidence" : "evidence_not_grounded",
        evidence_index: evidenceIndex,
        line_of_code: "reasonedDecisionValidation.ts:610-651",
      });
    }

    const claimTexts = [
      evaluation.reason,
      ...acceptedEvaluationEvidence,
    ];

    const evaluationFactualClaimDiagnostics: FactualClaimDiagnostic[] = [];
    for (const sentence of claimTexts.flatMap((text) => splitSentences(text))) {
      const diagnostic = assessFactualClaimGrounding(
        sentence,
        groundingTokens,
        exactEvidenceTexts,
        candidateArticleTokens,
        candidateAtomTokens,
        candidateReviewerTokens,
      );
      if (diagnostic) {
        evaluationFactualClaimDiagnostics.push(diagnostic);
      }
    }

    if (evaluationFactualClaimDiagnostics.length > 0) {
      const issue = createValidationIssue(
        "unsupported_factual_claim",
        `${evaluationPath}.reason`,
        [
          "The evaluation introduces factual claims that are not grounded in the quoted evidence or supplied candidates.",
          `Unsupported sentences: ${evaluationFactualClaimDiagnostics.slice(0, 3).map((diagnostic) => diagnostic.sentence).join(" | ")}`,
        ].join(" "),
        isStabilizationRecoverableIssue("unsupported_factual_claim") ? "recoverable" : "error",
      );
      issues.push(issue);
      evaluationIssues.push(issue);
      logger.warn("V3 reasoned decision grounding diagnostics", {
        validator_name: "reasonedDecisionValidation",
        diagnostic_type: "unsupported_factual_claim",
        evaluation_index: index,
        evaluation_article: evaluation.articleId,
        candidate_reviewers: [...candidateReviewerIds],
        candidate_reviewer_labels: [...candidateReviewerLabels],
        candidate_articles: [...candidateArticleIds],
        candidate_atoms: [...candidateAtomIds],
        expected_evidence: groundingEvidenceCandidates.map((candidate) => candidate.quote || candidate.extractedSpan).filter((value): value is string => value.length > 0),
        unsupported_sentences: evaluationFactualClaimDiagnostics.slice(0, 5).map((diagnostic) => ({
          sentence: diagnostic.sentence,
          unsupportedVocabularyTokens: diagnostic.unsupportedVocabularyTokens,
          supportRatio: diagnostic.supportRatio,
        })),
        line_of_code: "reasonedDecisionValidation.ts:362-459",
      });
    }

    if (candidateAtomIds.size > 0) {
      const candidateAtomPattern = /\b(?:atom[_-]?\d+(?:[_-]\d+)*|\d+-\d+)\b/gi;
      const atomMentionText = claimTexts.join(" | ");
      const atomMentions = [...new Set(atomMentionText.match(candidateAtomPattern) ?? [])];

      for (const atomId of atomMentions) {
        if (!candidateAtomIds.has(normalizeText(atomId))) {
          const issue = createValidationIssue(
            "atom_outside_candidate_set",
            `${evaluationPath}.reason`,
            `The reviewer referenced atom ${atomId}, but it was not supplied in the candidate atom set.`,
            isStabilizationRecoverableIssue("atom_outside_candidate_set") ? "recoverable" : "error",
          );
          issues.push(issue);
          evaluationIssues.push(issue);
        }
      }
    }

    const evaluationHasFatalIssues = evaluationIssues.some(isFatalValidationIssue);
    if (!evaluationHasFatalIssues && acceptedEvaluationEvidence.length > 0) {
      acceptedEvaluations.push(Object.freeze({
        ...evaluation,
        evidence: Object.freeze(acceptedEvaluationEvidence.length > 0 ? acceptedEvaluationEvidence : [...evaluation.evidence]),
      }));
    } else {
      if (acceptedEvaluationEvidence.length === 0) {
        const issue = createValidationIssue(
          "no_valid_supporting_evidence",
          `${evaluationPath}.evidence`,
          "No grounded supporting evidence remained after validation.",
          "error",
          {
            validatorStage: "evidence_item_grounding",
            expectedEvidence: groundingEvidenceCandidates.map((candidate) => candidate.quote || candidate.extractedSpan).filter((value): value is string => value.length > 0),
            rejectedEvidenceCount: evaluation.evidence.length,
          },
        );
        if (!issues.some((existingIssue) => existingIssue.code === issue.code && existingIssue.path === issue.path)) {
          issues.push(issue);
        }
        evaluationIssues.push(issue);
      }
      rejectedEvaluationRecords.push(Object.freeze({
        index,
        evaluation,
        issues: Object.freeze([...evaluationIssues]),
      }));
    }
  }

  const sharedClaimDiagnostics: FactualClaimDiagnostic[] = [];
  for (const sentence of sharedClaimSources.flatMap((text) => splitSentences(text))) {
    const diagnostic = assessFactualClaimGrounding(
      sentence,
      groundingTokens,
      exactEvidenceTexts,
      candidateArticleTokens,
      candidateAtomTokens,
      candidateReviewerTokens,
    );
    if (diagnostic) {
      sharedClaimDiagnostics.push(diagnostic);
    }
  }

  if (sharedClaimDiagnostics.length > 0) {
    const issue = createValidationIssue(
      "unsupported_factual_claim",
      "reasonedDecision.reasoning",
      [
        "The reviewer reasoning introduces factual claims that are not grounded in the quoted evidence or supplied candidates.",
        `Unsupported sentences: ${sharedClaimDiagnostics.slice(0, 3).map((diagnostic) => diagnostic.sentence).join(" | ")}`,
      ].join(" "),
      isStabilizationRecoverableIssue("unsupported_factual_claim") ? "recoverable" : "error",
    );
    issues.push(issue);
    logger.warn("V3 reasoned decision grounding diagnostics", {
      validator_name: "reasonedDecisionValidation",
      diagnostic_type: "unsupported_factual_claim",
      evaluation_index: null,
      evaluation_article: null,
      candidate_reviewers: [...candidateReviewerIds],
      candidate_reviewer_labels: [...candidateReviewerLabels],
      candidate_articles: [...candidateArticleIds],
      candidate_atoms: [...candidateAtomIds],
      expected_evidence: groundingEvidenceCandidates.map((candidate) => candidate.quote || candidate.extractedSpan).filter((value): value is string => value.length > 0),
      unsupported_sentences: sharedClaimDiagnostics.slice(0, 5).map((diagnostic) => ({
        sentence: diagnostic.sentence,
        unsupportedVocabularyTokens: diagnostic.unsupportedVocabularyTokens,
        supportRatio: diagnostic.supportRatio,
      })),
      line_of_code: "reasonedDecisionValidation.ts:671-733",
    });
  }

  if (rejectedEvaluationRecords.length > 0) {
    logger.warn("V3 reasoned decision evaluation rejections", {
      validator_name: "reasonedDecisionValidation",
      candidate_reviewers: [...candidateReviewerIds],
      candidate_reviewer_labels: [...candidateReviewerLabels],
      candidate_articles: [...candidateArticleIds],
      candidate_atoms: [...candidateAtomIds],
      rejected_evaluations: rejectedEvaluationRecords.slice(0, 10).map(({ index, evaluation, issues: evaluationIssues }) => ({
        evaluation_index: index,
        article_id: evaluation.articleId,
        status: evaluation.status,
        reason: evaluation.reason,
        issues: evaluationIssues.map(serializeIssueDetails),
      })),
      line_of_code: "reasonedDecisionValidation.ts:504-670",
    });
  }

  const fatalIssues = issues.filter(isFatalValidationIssue);

  if (fatalIssues.length > 0) {
    logValidationRejection(input, result, issues, candidateArticleIds, candidateAtomIds, candidateReviewerIds, candidateReviewerLabels);
  }

  const sanitizedDecision = Object.freeze({
    ...result.reasonedDecision,
    articleEvaluations: Object.freeze(acceptedEvaluations),
    applicableArticles: Object.freeze(acceptedEvaluations
      .filter((evaluation) => evaluation.status === "PASS")
      .map((evaluation) => evaluation.articleId)
      .filter((articleId, index, array) => array.indexOf(articleId) === index)
      .sort((left, right) => left - right)),
    rejectedArticles: Object.freeze([
      ...new Set([
        ...result.reasonedDecision.rejectedArticles,
        ...rejectedEvaluationRecords.map(({ evaluation }) => evaluation.articleId),
      ]),
    ].sort((left, right) => left - right)),
  });

  return Object.freeze({
    valid: fatalIssues.length === 0,
    issues: Object.freeze(issues),
    validationNote: fatalIssues.length === 0
      ? (issues.length === 0
        ? "The reasoned decision is evidence-first, quote-grounded, and article-by-article."
        : "The reasoned decision is evidence-first, quote-grounded, and article-by-article. Recoverable evidence items were rejected, but valid evidence items were preserved.")
      : [
          "Validation failed.",
          "Return an evidence-first, quote-grounded answer evaluated article-by-article.",
          "Use only exact quotes from the current evidence or scene.",
          ...fatalIssues.map((issue) => `${issue.path}: ${issue.message}`),
        ].join(" "),
    sanitizedDecision,
  });
}
