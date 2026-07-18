import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ProviderReasoningResult, V3ReasonedDecisionArticleEvaluation, V3ReasonedDecisionResult } from "./providerTypes.js";
import { logger } from "../../logger.js";

export type V3ReasonedDecisionValidationIssue = Readonly<{
  code: string;
  path: string;
  message: string;
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

function normalizeIdSet(values: readonly string[] | null | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map((value) => normalizeText(value)).filter((value) => value.length > 0));
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

function splitTokens(value: string): readonly string[] {
  return value
    .normalize("NFC")
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.toLowerCase())
    .filter((token) => token.length > 0) ?? [];
}

function splitSentences(value: string): readonly string[] {
  return value
    .normalize("NFC")
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
  const normalizedSentence = normalizeText(sentence);
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
  const normalizedSentence = normalizeText(sentence);
  if (normalizedSentence.length === 0) return null;
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
  if (concreteClaimTokens.length === 0) return null;

  return Object.freeze({
    sentence,
    unsupportedVocabularyTokens: Object.freeze([...new Set(unsupportedVocabularyTokens)]),
    supportRatio,
    reason: concreteClaimTokens.length > 0
      ? "The sentence introduces concrete factual content that is not grounded in the quoted evidence, current scene, candidate articles, candidate atoms, or reviewer scope."
      : "The sentence introduces factual content that is not grounded in the quoted evidence, current scene, candidate articles, candidate atoms, or reviewer scope.",
  });
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
  const groundingCorpus = normalizeText(collectGroundingCorpus(input, result));
  const groundingTokens = collectGroundingTokens(input, result);
  const primaryCandidate = result.evidence.candidates[result.evidence.primaryCandidateIndex ?? 0] ?? result.evidence.candidates[0] ?? null;
  const exactEvidenceTexts = new Set(
    result.evidence.candidates
      .flatMap((candidate) => [candidateText(candidate), candidate.text ?? ""])
      .map((text) => normalizeText(text))
      .filter((text) => text.length > 0),
  );

  const candidateArticleIds = normalizeIdSet(
    candidateDiagnostics?.articleRanking.selectedPolicyArticleIds.map((articleId) => String(articleId))
      ?? compiledReviewerContext?.selectedArticles.map((article) => article.articleId),
  );
  const candidateAtomIds = normalizeIdSet(
    candidateDiagnostics?.atomRanking.selectedPolicyAtomIds
      ?? compiledReviewerContext?.selectedAtoms.map((atom) => atom.atomId),
  );
  const candidateArticleTokens = buildCandidateReferenceTokenSet([...candidateArticleIds]);
  const candidateAtomTokens = buildCandidateReferenceTokenSet([...candidateAtomIds]);
  const candidateReviewerTokens = buildCandidateReferenceTokenSet([...candidateReviewerIds, ...candidateReviewerLabels]);
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
    const evaluationEvidence = [...new Set([
      ...evaluation.evidence,
      ...(evaluation.status === "PASS" ? result.reasonedDecision.supportingEvidence : []),
    ].map((value) => String(value).normalize("NFC").replace(/\s+/g, " ").trim()).filter((value) => value.length > 0))];

    if (candidateArticleIds.size > 0 && !candidateArticleIds.has(evaluationArticleId)) {
      const issue = {
        code: "article_outside_candidate_set",
        path: `${evaluationPath}.articleId`,
        message: `The reviewer returned article ${evaluation.articleId}, but it was not supplied in the candidate article set.`,
      };
      issues.push(issue);
      evaluationIssues.push(issue);
    }

    for (const [evidenceIndex, evidence] of evaluation.evidence.entries()) {
      const normalizedEvidence = normalizeText(evidence);
      if (normalizedEvidence.length === 0) {
        const issue = {
          code: "unsupported_supporting_evidence",
          path: `${evaluationPath}.evidence[${evidenceIndex}]`,
          message: "Supporting evidence cannot be empty.",
        };
        issues.push(issue);
        evaluationIssues.push(issue);
        continue;
      }
      if (exactEvidenceTexts.has(normalizedEvidence) || groundingCorpus.includes(normalizedEvidence)) {
        continue;
      }
      const issue = {
        code: "unsupported_supporting_evidence",
        path: `${evaluationPath}.evidence[${evidenceIndex}]`,
        message: `Supporting evidence must be an exact quote or scene span, but received: ${JSON.stringify(evidence)}.`,
      };
      issues.push(issue);
      evaluationIssues.push(issue);
    }

    const claimTexts = [
      evaluation.reason,
      ...evaluation.evidence,
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
      const issue = {
        code: "unsupported_factual_claim",
        path: `${evaluationPath}.reason`,
        message: [
          "The evaluation introduces factual claims that are not grounded in the quoted evidence or supplied candidates.",
          `Unsupported sentences: ${evaluationFactualClaimDiagnostics.slice(0, 3).map((diagnostic) => diagnostic.sentence).join(" | ")}`,
        ].join(" "),
      };
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
          const issue = {
            code: "atom_outside_candidate_set",
            path: `${evaluationPath}.reason`,
            message: `The reviewer referenced atom ${atomId}, but it was not supplied in the candidate atom set.`,
          };
          issues.push(issue);
          evaluationIssues.push(issue);
        }
      }
    }

    if (evaluationIssues.length === 0) {
      acceptedEvaluations.push(Object.freeze({
        ...evaluation,
        evidence: Object.freeze(evaluationEvidence.length > 0 ? evaluationEvidence : [...evaluation.evidence]),
      }));
    } else {
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
    const issue = {
      code: "unsupported_factual_claim",
      path: "reasonedDecision.reasoning",
      message: [
        "The reviewer reasoning introduces factual claims that are not grounded in the quoted evidence or supplied candidates.",
        `Unsupported sentences: ${sharedClaimDiagnostics.slice(0, 3).map((diagnostic) => diagnostic.sentence).join(" | ")}`,
      ].join(" "),
    };
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
        issues: evaluationIssues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
      })),
      line_of_code: "reasonedDecisionValidation.ts:504-670",
    });
  }

  if (issues.length > 0) {
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
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    validationNote: issues.length === 0
      ? "The reasoned decision is evidence-first, quote-grounded, and article-by-article."
      : [
          "Validation failed.",
          "Return an evidence-first, quote-grounded answer evaluated article-by-article.",
          "Use only exact quotes from the current evidence or scene.",
          ...issues.map((issue) => `${issue.path}: ${issue.message}`),
        ].join(" "),
    sanitizedDecision,
  });
}
