import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { LegalDecisionCollection } from "../legal/legalDecision.js";
import type { SceneAnalysisConcept, SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { buildExplanationCollection, buildLegacyExplanation } from "./explanationBuilder.js";
import type { ExplanationEngineInput } from "./explanationTypes.js";
import { createEvidenceCollectionFromVerifiedEvidence } from "../evidence/evidenceTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function toConceptRecord(concept: SceneAnalysisConcept, evidenceId: string, index: number): ConceptRecord {
  return Object.freeze({
    id: `legacy-concept-${index + 1}`,
    evidenceId,
    evidenceSpanId: concept.evidenceSpanIds[0] ?? evidenceId,
    conceptId: concept.conceptId,
    conceptName: concept.label,
    conceptCategory: concept.knowledgeDomains[0] ?? concept.label.toLowerCase(),
    confidence: concept.confidence,
    severity: "high",
    targets: Object.freeze([]),
    participants: Object.freeze([]),
    reason: concept.rationale[0] ?? `Legacy concept ${concept.label}.`,
    supportingEvidenceIds: Object.freeze([...concept.evidenceSpanIds]),
    evidenceSpanIds: Object.freeze([...concept.evidenceSpanIds]),
    knowledgeDomains: Object.freeze([...concept.knowledgeDomains]),
    label: concept.label,
    rationale: Object.freeze([...concept.rationale]),
  });
}

function synthesizeConceptCollection(state: SceneAnalysisState): ConceptCollection | null {
  if (state.conceptCollection && state.conceptCollection.concepts.length > 0) {
    return state.conceptCollection;
  }

  if (state.detectedConcepts.length === 0) {
    return null;
  }

  const evidenceId = state.verifiedEvidence?.evidenceId ?? state.primaryEvidenceSpanId ?? "legacy-evidence";
  const concepts = state.detectedConcepts.map((concept, index) => toConceptRecord(concept, evidenceId, index));

  return Object.freeze({
    sceneId: state.sceneId,
    evidenceCollectionId: state.evidenceCollection?.sceneId ?? null,
    concepts: Object.freeze(concepts),
    dedupDecisions: Object.freeze([]),
    normalization: Object.freeze([]),
    classificationOutput: Object.freeze([]),
    confidence: concepts.length === 0 ? 0 : Number((concepts.reduce((sum, concept) => sum + concept.confidence, 0) / concepts.length).toFixed(6)),
    executionTimeMs: 0,
  });
}

function synthesizeEvidenceCollection(state: SceneAnalysisState): EvidenceCollection | null {
  if (state.verifiedEvidence) {
    return createEvidenceCollectionFromVerifiedEvidence(state.sceneId, state.verifiedEvidence);
  }

  if (state.evidenceCollection && state.evidenceCollection.evidence.length > 0) {
    return state.evidenceCollection;
  }

  if (state.evidenceSpans.length === 0) {
    return null;
  }

  const evidence = Object.freeze([...state.evidenceSpans]);
  return Object.freeze({
    sceneId: state.sceneId,
    evidence,
    primaryEvidenceId: state.primaryEvidenceSpanId ?? evidence[0]?.id ?? null,
    dedupDecisions: Object.freeze([]),
    grounding: Object.freeze({
      totalCandidates: evidence.length,
      groundedCount: evidence.length,
      unmatchedCount: 0,
    }),
    executionTimeMs: 0,
  });
}

function synthesizeLegalDecisionCollection(
  state: SceneAnalysisState,
  conceptCollection: ConceptCollection | null,
): LegalDecisionCollection | null {
  if (state.legalDecisionCollection && state.legalDecisionCollection.decisions.length > 0) {
    return state.legalDecisionCollection;
  }

  const concept = conceptCollection?.concepts[0] ?? null;
  const article = state.legalPrimaryArticle ?? state.primaryArticle ?? state.legalCandidateArticles[0] ?? state.candidateArticles[0] ?? null;

  if (!concept || !article) {
    return null;
  }

  const candidateArticle = Object.freeze({
    ...article,
  });

  const decision = Object.freeze({
    id: `legacy-legal-${concept.conceptId}`,
    conceptId: concept.conceptId,
    candidateArticles: Object.freeze([candidateArticle]),
    primaryArticle: candidateArticle,
    secondaryArticles: Object.freeze(state.legalSecondaryArticles.slice(0, 2)),
    mappingReason: `Legacy article selection preserved for ${concept.label}.`,
    mappingConfidence: concept.confidence,
    knowledgeSource: "legacy",
  });

  return Object.freeze({
    sceneId: state.sceneId,
    conceptIds: Object.freeze([concept.conceptId]),
    decisions: Object.freeze([decision]),
    candidateArticles: Object.freeze([candidateArticle]),
    rankedCandidateArticles: Object.freeze([candidateArticle]),
    primaryArticle: candidateArticle,
    secondaryArticles: Object.freeze(state.legalSecondaryArticles.slice(0, 2)),
    supportingArticles: Object.freeze([]),
    knowledgeSource: "legacy",
    confidence: concept.confidence,
    executionTimeMs: 0,
  });
}

function buildExplanationInput(state: SceneAnalysisState): ExplanationEngineInput {
  const evidenceCollection = synthesizeEvidenceCollection(state);
  const conceptCollection = synthesizeConceptCollection(state);
  const legalDecisionCollection = synthesizeLegalDecisionCollection(state, conceptCollection);

  return {
    sceneId: state.sceneId,
    sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    evidenceCollection,
    verifiedEvidence: state.verifiedEvidence,
    conceptCollection,
    legalDecisionCollection,
  };
}

export function createExplanationNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const input = buildExplanationInput(state);
    const explanationCollection = buildExplanationCollection(input);
    const explanation = explanationCollection.primaryExplanation
      ? buildLegacyExplanation(input, explanationCollection.primaryExplanation)
      : null;

    return freezeSceneAnalysisState({
      ...state,
      explanationCollection,
      explanation,
    });
  };
}
