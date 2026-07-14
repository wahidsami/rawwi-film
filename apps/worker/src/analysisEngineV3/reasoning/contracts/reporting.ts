import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const FINDING_CONSTRUCTION_CONTRACT: V3ReasoningStageMetadata<"finding_construction"> = {
  name: "finding_construction",
  description: "Construct an internal finding object.",
  purpose: "Assemble the structured finding before JSON rendering.",
  inputs: ["candidate_evidence", "legal_decision", "exceptions", "context_evaluation"],
  outputs: ["finding"],
};

export const REPORTING_CONTRACT: V3ReasoningStageMetadata<"reporting"> = {
  name: "reporting",
  description: "Produce the final rationale and output-ready structure.",
  purpose: "Convert the internal finding into report-ready fields.",
  inputs: ["finding", "candidate_evidence", "context_evaluation", "legal_decision", "exceptions"],
  outputs: ["reporting"],
};

