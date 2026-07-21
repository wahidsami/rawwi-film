import type { SceneAnalysisConcept, SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { buildConceptCollection, buildLegacyConceptsFromCollection } from "./conceptBuilder.js";
import type { ConceptCollection } from "./conceptTypes.js";
import { createEvidenceCollectionFromVerifiedEvidence } from "../evidence/evidenceTypes.js";

export type ConceptClassificationNodeOutput = Readonly<{
  conceptCollection: ConceptCollection;
  detectedConcepts: readonly SceneAnalysisConcept[];
}>;

export function classifyConceptCollection(state: SceneAnalysisState): ConceptClassificationNodeOutput {
  const evidenceCollection = state.verifiedEvidence
    ? createEvidenceCollectionFromVerifiedEvidence(state.sceneId, state.verifiedEvidence)
    : null;
  const conceptCollection = buildConceptCollection(evidenceCollection, state.sceneId);
  const detectedConcepts = buildLegacyConceptsFromCollection(conceptCollection);

  return Object.freeze({
    conceptCollection,
    detectedConcepts,
  });
}

export function createConceptClassificationNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const classification = classifyConceptCollection(state);
    return freezeSceneAnalysisState({
      ...state,
      conceptCollection: classification.conceptCollection,
      detectedConcepts: classification.detectedConcepts,
    });
  };
}
