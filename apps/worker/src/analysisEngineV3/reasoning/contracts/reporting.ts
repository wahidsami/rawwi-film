import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const CONSISTENCY_VALIDATION_CONTRACT: V3ReasoningStageMetadata<"consistency_validation"> = {
  name: "consistency_validation",
  description: "Validate that the explanation still matches the evidence and classification.",
  purpose: "Confirm the explanation remains grounded before final emission.",
  inputs: ["grounded_evidence", "concepts", "primary_article", "explanation"],
  outputs: ["validated_finding"],
};

