import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ProviderReasoningResult, V3ReasonedDecisionResult } from "./providerTypes.js";

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

const GENERIC_ALLOWED_TOKENS = new Set([
  "a",
  "ability",
  "according",
  "analysis",
  "and",
  "article",
  "articles",
  "authoritative",
  "because",
  "before",
  "but",
  "case",
  "commentary",
  "could",
  "confidence",
  "context",
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
  "interpretation",
  "kept",
  "keeping",
  "legal",
  "language",
  "likely",
  "line",
  "literal",
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
  "supports",
  "support",
  "supported",
  "supports",
  "supporting",
  "straightforward",
  "story",
  "text",
  "the",
  "this",
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
]);

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function splitTokens(value: string): readonly string[] {
  return value
    .normalize("NFC")
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.map((token) => token.toLowerCase())
    .filter((token) => token.length > 0) ?? [];
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
    reasoning: "NO VIOLATION",
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
    riskAnalysis: "Insufficient grounded evidence. Conservative NO VIOLATION fallback.",
    narrativeAnalysis: "Insufficient grounded evidence.",
    humanLikeExplanation: "NO VIOLATION",
    recommendation: "NO VIOLATION",
  });
}

export function validateReasonedDecisionAgainstEvidence(
  input: V3PromptBuilderInput,
  result: V3ProviderReasoningResult,
): V3ReasonedDecisionValidationResult {
  const issues: V3ReasonedDecisionValidationIssue[] = [];
  const groundingCorpus = normalizeText(collectGroundingCorpus(input, result));
  const primaryCandidate = result.evidence.candidates[result.evidence.primaryCandidateIndex ?? 0] ?? result.evidence.candidates[0] ?? null;
  const exactEvidenceTexts = new Set(
    result.evidence.candidates
      .flatMap((candidate) => [candidateText(candidate), candidate.text ?? ""])
      .map((text) => normalizeText(text))
      .filter((text) => text.length > 0),
  );

  const recommendation = normalizeText(result.reasonedDecision.recommendation);
  const noViolationRecommendation = recommendation.includes("no violation");
  const passArticleCount = result.reasonedDecision.articleEvaluations.filter((evaluation) => evaluation.status === "PASS").length;
  if (passArticleCount === 0 && !noViolationRecommendation) {
    issues.push({
      code: "insufficient_evidence_requires_no_violation",
      path: "reasonedDecision.recommendation",
      message: "When no article passes, the reviewer must return NO VIOLATION instead of guessing.",
    });
  }

  const exactEvidenceFailure = result.reasonedDecision.supportingEvidence
    .map((evidence, index) => ({ evidence, index }))
    .filter(({ evidence }) => {
      const normalizedEvidence = normalizeText(evidence);
      if (normalizedEvidence.length === 0) return true;
      if (exactEvidenceTexts.has(normalizedEvidence)) return false;
      return !groundingCorpus.includes(normalizedEvidence);
    });

  for (const { evidence, index } of exactEvidenceFailure) {
    issues.push({
      code: "unsupported_supporting_evidence",
      path: `reasonedDecision.supportingEvidence[${index}]`,
      message: `Supporting evidence must be an exact quote or scene span, but received: ${JSON.stringify(evidence)}.`,
    });
  }

  const claimText = [
    result.reasonedDecision.reasoning,
    result.reasonedDecision.narrativeAnalysis,
    result.reasonedDecision.humanLikeExplanation,
    result.reasonedDecision.recommendation,
  ].join(" | ");

  const unsupportedTokens = splitTokens(claimText).filter((token) => {
    if (token.length < 4) return false;
    if (GENERIC_ALLOWED_TOKENS.has(token)) return false;
    if (groundingCorpus.includes(token)) return false;
    return true;
  });

  if (unsupportedTokens.length > 0) {
    issues.push({
      code: "unsupported_claim_tokens",
      path: "reasonedDecision.reasoning",
      message: `The explanation introduced tokens not grounded in the quoted evidence or current scene: ${[...new Set(unsupportedTokens)].slice(0, 8).join(", ")}.`,
    });
  }

  const sanitizedDecision = issues.length === 0 ? result.reasonedDecision : buildNoViolationDecision(input, result);

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    validationNote: issues.length === 0
      ? "The reasoned decision is evidence-first, quote-grounded, and article-by-article."
      : [
          "Validation failed.",
          "Return an evidence-first, quote-grounded answer evaluated article-by-article.",
          "Use only exact quotes from the current evidence or scene.",
          "If no article passes, return NO VIOLATION.",
          ...issues.map((issue) => `${issue.path}: ${issue.message}`),
        ].join(" "),
    sanitizedDecision,
  });
}
