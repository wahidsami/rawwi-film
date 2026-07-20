import type { V3ReasoningStageMetadata } from "../stageTypes.js";

export const LEGAL_CLASSIFICATION_CONTRACT: V3ReasoningStageMetadata<"legal_classification"> = {
  name: "legal_classification",
  description: "Map concepts to candidate GCAM articles and atoms.",
  purpose: "Rank the legal consequence of the grounded concepts using Academy knowledge.",
  inputs: ["grounded_evidence", "observed_facts", "concepts", "knowledge_domains"],
  outputs: ["primary_article", "secondary_articles", "applicable_atoms"],
};

export const EXPLANATION_CONTRACT: V3ReasoningStageMetadata<"explanation"> = {
  name: "explanation",
  description: "Generate an explanation that only references grounded evidence and the selected article.",
  purpose: "Explain the legal conclusion without inventing facts outside the quote.",
  inputs: ["grounded_evidence", "concepts", "primary_article", "secondary_articles"],
  outputs: ["explanation"],
};
