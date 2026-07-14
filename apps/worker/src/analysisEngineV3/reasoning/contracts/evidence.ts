import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const EVIDENCE_IDENTIFICATION_CONTRACT: V3ReasoningStageMetadata<"evidence_identification"> = {
  name: "evidence_identification",
  description: "Locate candidate evidence inside the chunk.",
  purpose: "Identify literal spans worth evaluating further.",
  inputs: ["chunk", "narrative_understanding", "subject"],
  outputs: ["candidate_evidence"],
};

