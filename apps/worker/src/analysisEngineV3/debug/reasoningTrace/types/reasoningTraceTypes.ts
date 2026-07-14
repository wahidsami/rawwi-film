export const REASONING_TRACE_STAGE_ORDER = [
  "raw_script_input",
  "scene_detection",
  "dialogue_detection",
  "description_detection",
  "entity_detection",
  "concept_detection",
  "target_detection",
  "action_detection",
  "context_detection",
  "intent_detection",
  "relationship_detection",
  "narrative_detection",
  "evidence_collection",
  "evidence_weighting",
  "reviewer_methodology",
  "reviewer_judgment",
  "confidence_calculation",
  "alternative_interpretations",
  "rejected_interpretations",
  "final_reviewer_decision",
  "gcam_mapping",
  "finding_generation",
  "final_report",
] as const;

export type ReasoningTraceStageId = (typeof REASONING_TRACE_STAGE_ORDER)[number];

export const REASONING_TRACE_STAGE_TITLES: Readonly<Record<ReasoningTraceStageId, string>> = Object.freeze({
  raw_script_input: "Raw Script Input",
  scene_detection: "Scene Detection",
  dialogue_detection: "Dialogue Detection",
  description_detection: "Description Detection",
  entity_detection: "Entity Detection",
  concept_detection: "Concept Detection",
  target_detection: "Target Detection",
  action_detection: "Action Detection",
  context_detection: "Context Detection",
  intent_detection: "Intent Detection",
  relationship_detection: "Relationship Detection",
  narrative_detection: "Narrative Detection",
  evidence_collection: "Evidence Collection",
  evidence_weighting: "Evidence Weighting",
  reviewer_methodology: "Reviewer Methodology",
  reviewer_judgment: "Reviewer Judgment",
  confidence_calculation: "Confidence Calculation",
  alternative_interpretations: "Alternative Interpretations",
  rejected_interpretations: "Rejected Interpretations",
  final_reviewer_decision: "Final Reviewer Decision",
  gcam_mapping: "GCAM Mapping",
  finding_generation: "Finding Generation",
  final_report: "Final Report",
});

export type ReasoningTraceAssetReferences = Readonly<{
  knowledgeAssetsUsed: readonly string[];
  lessonIds: readonly string[];
  decisionRecordIds: readonly string[];
  patternIds: readonly string[];
  benchmarkIds: readonly string[];
  reviewerMethodologyIds: readonly string[];
  narrativeIds: readonly string[];
  intentIds: readonly string[];
  relationshipIds: readonly string[];
  judgmentIds: readonly string[];
  gcamArticleIds: readonly number[];
  gcamAtomIds: readonly string[];
}>;

export type ReasoningTraceStageDraft = Readonly<{
  stage: ReasoningTraceStageId;
  title?: string | null;
  timestamp?: string | null;
  inputs?: readonly string[];
  outputs?: readonly string[];
  confidence?: number | null;
  supportingEvidence?: readonly string[];
  knowledgeAssetsUsed?: readonly string[];
  lessonIds?: readonly string[];
  decisionRecordIds?: readonly string[];
  patternIds?: readonly string[];
  benchmarkIds?: readonly string[];
  reviewerMethodologyIds?: readonly string[];
  narrativeIds?: readonly string[];
  intentIds?: readonly string[];
  relationshipIds?: readonly string[];
  judgmentIds?: readonly string[];
  gcamArticleIds?: readonly number[];
  gcamAtomIds?: readonly string[];
  reason?: string | null;
}>;

export type ReasoningTraceStageRecord = Readonly<{
  stage: ReasoningTraceStageId;
  title: string;
  timestamp: string;
  inputs: readonly string[];
  outputs: readonly string[];
  confidence: number;
  supportingEvidence: readonly string[];
  knowledgeAssetsUsed: readonly string[];
  lessonIds: readonly string[];
  decisionRecordIds: readonly string[];
  patternIds: readonly string[];
  benchmarkIds: readonly string[];
  reviewerMethodologyIds: readonly string[];
  narrativeIds: readonly string[];
  intentIds: readonly string[];
  relationshipIds: readonly string[];
  judgmentIds: readonly string[];
  gcamArticleIds: readonly number[];
  gcamAtomIds: readonly string[];
  reason: string;
}>;

export type ReasoningTraceComparisonStatus = "matched" | "partial" | "missing" | "unexpected";

export type ReasoningTraceStageComparison = Readonly<{
  stage: ReasoningTraceStageId;
  title: string;
  expected: ReasoningTraceStageRecord | null;
  actual: ReasoningTraceStageRecord | null;
  status: ReasoningTraceComparisonStatus;
  matched: readonly string[];
  missing: readonly string[];
  unexpected: readonly string[];
  confidenceDifference: number | null;
  reasonDifference: readonly string[];
  knowledgeDifference: readonly string[];
}>;

export type ReasoningTraceComparatorReport = Readonly<{
  hash: string;
  expectedStageCount: number;
  actualStageCount: number;
  matchedStageCount: number;
  missingStageCount: number;
  unexpectedStageCount: number;
  partialStageCount: number;
  confidenceDifference: number;
  reasonDifferenceCount: number;
  knowledgeDifferenceCount: number;
  coveragePercent: number;
  readyForProduction: boolean;
  stages: readonly ReasoningTraceStageComparison[];
}>;

export type ReasoningTraceCoverageReport = Readonly<{
  hash: string;
  coveragePercent: number;
  knowledgeCoveragePercent: number;
  confidenceAlignmentPercent: number;
  expectedStageCount: number;
  actualStageCount: number;
  matchedStageCount: number;
  missingStageCount: number;
  unexpectedStageCount: number;
  partialStageCount: number;
  missingStages: readonly ReasoningTraceStageId[];
  unexpectedStages: readonly ReasoningTraceStageId[];
  warnings: readonly string[];
  readyForProduction: boolean;
}>;

export type ReasoningTraceTimelineEntry = Readonly<{
  order: number;
  stage: ReasoningTraceStageId;
  title: string;
  timestamp: string;
  confidence: number;
  label: string;
  hash: string;
  inputs: readonly string[];
  outputs: readonly string[];
}>;

export type ReasoningTraceTimeline = Readonly<{
  hash: string;
  entries: readonly ReasoningTraceTimelineEntry[];
}>;

export type ReasoningTraceComparatorInput = Readonly<{
  expected: readonly ReasoningTraceStageDraft[];
  actual: readonly ReasoningTraceStageDraft[];
}>;
