import { EVIDENCE_IDENTIFICATION_CONTRACT } from "./contracts/evidence.js";
import { EXCEPTION_EVALUATION_CONTRACT, LEGAL_EVALUATION_CONTRACT } from "./contracts/legal.js";
import { NARRATIVE_UNDERSTANDING_CONTRACT } from "./contracts/narrative.js";
import { FINDING_CONSTRUCTION_CONTRACT, REPORTING_CONTRACT } from "./contracts/reporting.js";
import type { V3ReasoningStageMetadata } from "./stageTypes.js";

export const V3_REASONING_STAGE_SEQUENCE: V3ReasoningStageMetadata[] = [
  NARRATIVE_UNDERSTANDING_CONTRACT,
  EVIDENCE_IDENTIFICATION_CONTRACT,
  {
    name: "context_evaluation",
    description: "Use story memory and local context to interpret the candidate evidence.",
    purpose: "Bridge literal evidence with nearby narrative meaning.",
    inputs: ["story_memory", "chunk", "candidate_evidence", "narrative_understanding"],
    outputs: ["context_evaluation"],
  },
  LEGAL_EVALUATION_CONTRACT,
  EXCEPTION_EVALUATION_CONTRACT,
  FINDING_CONSTRUCTION_CONTRACT,
  REPORTING_CONTRACT,
];

export function getV3ReasoningStageSequence(): V3ReasoningStageMetadata[] {
  return [...V3_REASONING_STAGE_SEQUENCE];
}

