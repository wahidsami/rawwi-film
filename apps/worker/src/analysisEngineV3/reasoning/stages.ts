import type { V3ReasoningStageMetadata } from "./stageTypes.js";

export const V3_REASONING_STAGE_SEQUENCE: V3ReasoningStageMetadata[] = [
  {
    name: "evidence_extraction",
    description: "Locate the grounded quote and lock it before any interpretation.",
    purpose: "Freeze the smallest grounded evidence span and evidence type.",
    inputs: ["chunk"],
    outputs: ["grounded_evidence", "evidence_type"],
  },
  {
    name: "evidence_judge",
    description: "Determine the literal facts visible in the grounded quote.",
    purpose: "Answer what literally happened before legal interpretation.",
    inputs: ["grounded_evidence", "evidence_type"],
    outputs: ["observed_facts"],
  },
  {
    name: "concept_identification",
    description: "Determine concepts only from the grounded evidence and evidence judge output.",
    purpose: "Extract the smallest legal concepts without naming GCAM articles.",
    inputs: ["grounded_evidence", "observed_facts"],
    outputs: ["concepts", "knowledge_domains"],
  },
  {
    name: "legal_classification",
    description: "Map the concepts to candidate GCAM articles and atoms.",
    purpose: "Rank the legal consequence of the concepts using Academy knowledge.",
    inputs: ["grounded_evidence", "observed_facts", "concepts", "knowledge_domains"],
    outputs: ["primary_article", "secondary_articles", "applicable_atoms"],
  },
  {
    name: "explanation",
    description: "Generate an explanation that only references the grounded evidence and selected article.",
    purpose: "Explain the legal conclusion without inventing facts outside the quote.",
    inputs: ["grounded_evidence", "concepts", "primary_article", "secondary_articles"],
    outputs: ["explanation"],
  },
  {
    name: "consistency_validation",
    description: "Check that explanation, evidence, and classification still match.",
    purpose: "Reject or regenerate only the inconsistent part without restarting the full chain.",
    inputs: ["grounded_evidence", "concepts", "primary_article", "explanation"],
    outputs: ["validated_finding"],
  },
];

export function getV3ReasoningStageSequence(): V3ReasoningStageMetadata[] {
  return [...V3_REASONING_STAGE_SEQUENCE];
}
