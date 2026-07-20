export type V3ReasoningStageName =
  | "evidence_extraction"
  | "evidence_judge"
  | "concept_identification"
  | "legal_classification"
  | "explanation"
  | "consistency_validation";

export type V3ReasoningStageIO = {
  evidence_extraction: {
    inputs: ["chunk"];
    outputs: ["grounded_evidence"];
  };
  evidence_judge: {
    inputs: ["grounded_evidence"];
    outputs: ["observed_facts"];
  };
  concept_identification: {
    inputs: ["grounded_evidence", "observed_facts"];
    outputs: ["concepts", "knowledge_domains"];
  };
  legal_classification: {
    inputs: ["grounded_evidence", "observed_facts", "concepts", "knowledge_domains"];
    outputs: ["primary_article", "secondary_articles", "applicable_atoms"];
  };
  explanation: {
    inputs: ["grounded_evidence", "concepts", "primary_article", "secondary_articles"];
    outputs: ["explanation"];
  };
  consistency_validation: {
    inputs: ["grounded_evidence", "concepts", "primary_article", "explanation"];
    outputs: ["validated_finding"];
  };
};

export type V3ReasoningStageMetadata<Name extends V3ReasoningStageName = V3ReasoningStageName> = {
  name: Name;
  description: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
};

export type V3ReasoningStageId = V3ReasoningStageName;
