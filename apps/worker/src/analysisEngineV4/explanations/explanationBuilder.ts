import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecision, LegalDecisionCollection } from "../legal/legalDecision.js";
import { validateExplanationCollection } from "./explanationValidator.js";
import type { ExplanationCollection, ExplanationEngineInput, ExplanationRecord, ExplanationRecommendedAction } from "./explanationTypes.js";
import { buildExplanationPrompt } from "./explanationPrompt.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function pickConcept(conceptCollection: ConceptCollection | null, conceptId: string): ConceptRecord | null {
  return conceptCollection?.concepts.find((concept) => concept.conceptId === conceptId) ?? null;
}

function recommendedActionForConcept(concept: ConceptRecord | null): ExplanationRecommendedAction {
  switch (concept?.severity ?? "low") {
    case "critical":
      return "Delete";
    case "high":
      return "Modify";
    case "medium":
      return "Requires Approval";
    case "low":
    default:
      return "Requires Verification";
  }
}

export function buildExplanationRecord(input: ExplanationEngineInput, decision: LegalDecision, index: number): ExplanationRecord {
  const concept = pickConcept(input.conceptCollection, decision.conceptId);
  const evidence = input.verifiedEvidence ?? null;
  const article = decision.primaryArticle;
  const evidenceText = normalizeText(evidence?.text ?? "");
  const conceptLabel = concept?.label ?? decision.conceptId;
  const articleLabel = article ? `${article.articleId} (${article.titleAr})` : "unresolved article";
  const recommendedAction = recommendedActionForConcept(concept);
  const confidence = Number(Math.min(1, Math.max(0, ((decision.mappingConfidence + (concept?.confidence ?? 0)) / 2))).toFixed(6));

  return Object.freeze({
    id: `explanation-${input.sceneId}-${index + 1}`,
    legalDecisionId: decision.id,
    conceptId: decision.conceptId,
    evidenceId: evidence?.evidenceId ?? `evidence-${index + 1}`,
    title: `${conceptLabel} → ${article?.titleAr ?? "Unresolved article"}`,
    summary: article
      ? `Grounded evidence "${evidenceText}" expresses ${conceptLabel}, so the Academy maps it to article ${articleLabel}.`
      : `Grounded evidence "${evidenceText}" does not resolve to a legal article.`,
    reasoning: Object.freeze([
      evidenceText ? `Evidence: ${evidenceText}` : "Evidence: unavailable",
      `Concept: ${conceptLabel} (${decision.conceptId})`,
      article ? `Article: ${articleLabel}` : "Article: unresolved",
      decision.mappingReason ? `Mapping reason: ${decision.mappingReason}` : "Mapping reason: unavailable",
      `Recommended action: ${recommendedAction}`,
    ]),
    recommendedAction,
    confidence,
  });
}

function selectPrimaryExplanation(explanations: readonly ExplanationRecord[], legalDecisionCollection: LegalDecisionCollection | null): ExplanationRecord | null {
  if (explanations.length === 0) {
    return null;
  }

  const primaryArticleId = legalDecisionCollection?.primaryArticle?.articleId ?? null;
  if (primaryArticleId !== null) {
    const matched = explanations.find((explanation) => {
      const decision = legalDecisionCollection?.decisions.find((entry) => entry.id === explanation.legalDecisionId) ?? null;
      return decision?.primaryArticle?.articleId === primaryArticleId;
    });
    if (matched) {
      return matched;
    }
  }

  return explanations[0] ?? null;
}

function toLegacyExplanation(explanation: ExplanationRecord, input: ExplanationEngineInput): import("../sceneAnalysisState.js").SceneAnalysisExplanation {
  const decision = input.legalDecisionCollection?.decisions.find((entry) => entry.id === explanation.legalDecisionId) ?? null;
  const evidence = input.evidenceCollection?.evidence.find((entry) => entry.id === explanation.evidenceId || entry.spanId === explanation.evidenceId) ?? null;
  const article = decision?.primaryArticle ?? null;
  const groundedEvidence = input.verifiedEvidence?.evidenceId === explanation.evidenceId
    ? input.verifiedEvidence.text
    : evidence?.text ?? evidence?.rawText ?? "";

  return Object.freeze({
    summary: explanation.summary,
    groundedEvidence,
    primaryArticleId: article?.articleId ?? null,
    primaryArticleTitleAr: article?.titleAr ?? null,
    primaryAtomId: null,
    primaryAtomTitleAr: null,
    rationale: explanation.reasoning,
  });
}

export function buildExplanationCollection(input: ExplanationEngineInput): ExplanationCollection {
  const startedAt = Date.now();
  const explanations = Object.freeze((input.legalDecisionCollection?.decisions ?? []).map((decision, index) => buildExplanationRecord(input, decision, index)));
  const prompt = buildExplanationPrompt(input);
  const response = JSON.stringify({ explanations }, null, 2);
  const validationResult = validateExplanationCollection({
    evidenceCollection: input.evidenceCollection,
    conceptCollection: input.conceptCollection,
    legalDecisionCollection: input.legalDecisionCollection,
    explanations,
  });
  const primaryExplanation = selectPrimaryExplanation(explanations, input.legalDecisionCollection);
  const confidence = explanations.length === 0
    ? 0
    : Number((explanations.reduce((sum, explanation) => sum + explanation.confidence, 0) / explanations.length).toFixed(6));

  return Object.freeze({
    sceneId: input.sceneId,
    explanations,
    primaryExplanationId: primaryExplanation?.id ?? null,
    primaryExplanation,
    prompt,
    response,
    validationResult,
    confidence,
    executionTimeMs: Math.max(0, Date.now() - startedAt),
  });
}

export function buildLegacyExplanation(input: ExplanationEngineInput, explanation: ExplanationRecord): import("../sceneAnalysisState.js").SceneAnalysisExplanation {
  return toLegacyExplanation(explanation, input);
}
