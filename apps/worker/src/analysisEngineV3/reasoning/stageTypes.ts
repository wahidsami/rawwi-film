export type V3ReasoningStageName =
  | "narrative_understanding"
  | "evidence_identification"
  | "context_evaluation"
  | "legal_evaluation"
  | "exception_evaluation"
  | "finding_construction"
  | "reporting";

export type V3ReasoningStageIO = {
  narrative_understanding: {
    inputs: ["story_memory", "chunk", "subject", "glossary"];
    outputs: ["narrative_understanding"];
  };
  evidence_identification: {
    inputs: ["chunk", "narrative_understanding", "subject"];
    outputs: ["candidate_evidence"];
  };
  context_evaluation: {
    inputs: ["story_memory", "chunk", "candidate_evidence", "narrative_understanding"];
    outputs: ["context_evaluation"];
  };
  legal_evaluation: {
    inputs: ["subject", "candidate_evidence", "context_evaluation", "glossary"];
    outputs: ["legal_decision"];
  };
  exception_evaluation: {
    inputs: ["subject", "candidate_evidence", "context_evaluation", "legal_decision"];
    outputs: ["exceptions"];
  };
  finding_construction: {
    inputs: ["candidate_evidence", "legal_decision", "exceptions", "context_evaluation"];
    outputs: ["finding"];
  };
  reporting: {
    inputs: ["finding", "candidate_evidence", "context_evaluation", "legal_decision", "exceptions"];
    outputs: ["reporting"];
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

