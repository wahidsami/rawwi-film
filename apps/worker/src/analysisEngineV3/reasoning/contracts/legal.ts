import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const LEGAL_EVALUATION_CONTRACT: V3ReasoningStageMetadata<"legal_evaluation"> = {
  name: "legal_evaluation",
  description: "Apply the subject rules after evidence is identified.",
  purpose: "Evaluate the candidate evidence using the active subject rules.",
  inputs: ["subject", "candidate_evidence", "context_evaluation", "glossary"],
  outputs: ["legal_decision"],
};

export const EXCEPTION_EVALUATION_CONTRACT: V3ReasoningStageMetadata<"exception_evaluation"> = {
  name: "exception_evaluation",
  description: "Apply exclusions and exceptions.",
  purpose: "Determine whether the evidence should be excluded despite a preliminary legal signal.",
  inputs: ["subject", "candidate_evidence", "context_evaluation", "legal_decision"],
  outputs: ["exceptions"],
};

