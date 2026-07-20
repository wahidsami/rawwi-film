import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const CONCEPT_IDENTIFICATION_CONTRACT: V3ReasoningStageMetadata<"concept_identification"> = {
  name: "concept_identification",
  description: "Determine concepts only from the grounded evidence and literal facts.",
  purpose: "Extract legal concepts from the grounded evidence without naming the final GCAM article.",
  inputs: ["grounded_evidence", "observed_facts"],
  outputs: ["concepts", "knowledge_domains"],
};
