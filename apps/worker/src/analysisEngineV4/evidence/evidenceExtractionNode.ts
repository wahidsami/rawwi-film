import type { SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { buildEvidenceCollection } from "./evidenceBuilder.js";
import { createVerifiedEvidenceFromEvidence } from "./evidenceTypes.js";

export type EvidenceExtractionNodeOutput = SceneAnalysisState;

export function createEvidenceExtractionNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const evidenceCollection = buildEvidenceCollection(state);
    const evidenceSpans = evidenceCollection.evidence;
    const primaryEvidence = evidenceSpans.find((evidence) => evidence.id === evidenceCollection.primaryEvidenceId) ?? null;
    const verifiedEvidence = primaryEvidence ? createVerifiedEvidenceFromEvidence(primaryEvidence) : null;

    return freezeSceneAnalysisState({
      ...state,
      evidenceCollection,
      verifiedEvidence,
      evidenceSpans,
      primaryEvidenceSpanId: primaryEvidence?.id ?? null,
      primaryEvidenceText: primaryEvidence?.text ?? null,
      primaryEvidenceReason: primaryEvidence
        ? `Smallest grounded evidence span selected from ${evidenceCollection.grounding.groundedCount} grounded candidate(s).`
        : null,
    });
  };
}

