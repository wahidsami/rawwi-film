import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const EVIDENCE_EXTRACTION_CONTRACT: V3ReasoningStageMetadata<"evidence_extraction"> = {
  name: "evidence_extraction",
  description: "Locate and freeze the smallest grounded evidence span.",
  purpose: "Extract the grounded quote before any interpretation.",
  inputs: ["chunk"],
  outputs: ["grounded_evidence"],
};

export const EVIDENCE_JUDGE_CONTRACT: V3ReasoningStageMetadata<"evidence_judge"> = {
  name: "evidence_judge",
  description: "Determine only the literal facts visible in the grounded evidence.",
  purpose: "Record the literal evidence facts before concept identification.",
  inputs: ["grounded_evidence"],
  outputs: ["observed_facts"],
};
