import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { V3StageHash, V3StageTiming } from "../pipeline/pipelineTypes.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { ReviewerKnowledgeLesson } from "../reviewerKnowledge/lessons/lessonTypes.js";
import type { PatternLibraryDocument } from "../reviewerKnowledge/patternLibraries/patternLibraryTypes.js";
import type { DecisionRecord } from "../reviewerKnowledge/decisionRecords/decisionRecordTypes.js";
import type { V3ReasoningTrace } from "./reasoningTraceTypes.js";

export type V3DebugGeneralSection = Readonly<{
  engineVersion: string;
  provider: string;
  model: string;
  executionTimeMs: number | null;
  totalPromptSize: number | null;
  totalCompletionSize: number | null;
  promptHash: string;
  semanticHash: string;
  legalHash: string;
  rawResponseHash: string | null;
  executionSignatureHash: string | null;
  stageHashes: readonly V3StageHash[];
  stageTimings: readonly V3StageTiming[];
}>;

export type V3DebugLessonSummary = Readonly<{
  id: string;
  title: string;
  version: string;
  summary: string;
}>;

export type V3DebugReviewerPackSummary = Readonly<{
  id: string;
  moduleId: string;
  title: string;
  triggerConceptIds: readonly string[];
  protectedInterests: readonly string[];
  protectedConcepts: readonly string[];
}>;

export type V3DebugPatternLibrarySummary = Readonly<{
  id: string;
  title: string;
  version: string;
  entryCount: number;
}>;

export type V3DebugDecisionRecordSummary = Readonly<{
  id: string;
  title: string;
  version: string;
  findingType: string;
  confidence: string;
}>;

export type V3DebugBlueprintSummary = Readonly<{
  folder: string;
  files: readonly string[];
  hash: string;
}>;

export type V3DebugAcademySection = Readonly<{
  loadedLessons: readonly V3DebugLessonSummary[];
  loadedReviewerPacks: readonly V3DebugReviewerPackSummary[];
  loadedPatternLibraries: readonly V3DebugPatternLibrarySummary[];
  loadedDecisionRecords: readonly V3DebugDecisionRecordSummary[];
  loadedBlueprints: readonly V3DebugBlueprintSummary[];
}>;

export type V3DebugIntelligenceSection = Readonly<{
  detectedConcepts: readonly string[];
  detectedEntities: readonly string[];
  detectedTargets: readonly string[];
  detectedIntents: readonly string[];
  detectedContexts: readonly string[];
}>;

export type V3DebugReviewerSection = Readonly<{
  reviewerQuestionsAsked: readonly string[];
  evidenceCollected: readonly string[];
  confidenceEvolution: readonly Readonly<{ stage: string; confidence: number; note: string | null }>[];
  discardedHypotheses: readonly string[];
  acceptedHypotheses: readonly string[];
}>;

export type V3DebugLegalSection = Readonly<{
  candidateGcamArticles: readonly number[];
  finalArticle: number | null;
  reasoningPath: readonly string[];
}>;

export type V3DebugGcamMappingSection = Readonly<{
  article: number | null;
  atom: string | null;
  mappingConfidence: number | null;
  mappingSource: string;
  knowledgeDebt: readonly string[];
  mappingStatus: string;
}>;

export type V3DebugReviewerJudgmentSection = Readonly<{
  primaryDecision: string;
  alternativeDecisions: readonly string[];
  rejectedInterpretations: readonly string[];
  confidence: number;
  evidenceUsed: readonly string[];
  decisionRecordsUsed: readonly string[];
}>;

export type V3DebugReasoningChainSection = Readonly<{
  narrative: readonly string[];
  intent: readonly string[];
  relationships: readonly string[];
  context: readonly string[];
  evidence: readonly string[];
  methodology: readonly string[];
  judgment: readonly string[];
  gcamMapping: readonly string[];
}>;

export type V3DebugKnowledgeUsageSection = Readonly<{
  lessonsUsed: readonly string[];
  patternsUsed: readonly string[];
  decisionRecordsUsed: readonly string[];
  benchmarksReferenced: readonly string[];
  knowledgeAcquisitionRecords: readonly string[];
}>;

export type V3DebugFindingGenerationSection = Readonly<{
  findingTitle: string;
  findingCategory: string;
  mappedArticle: number | null;
  mappedAtom: string | null;
  evidence: readonly string[];
  confidence: number;
  decision: "finding" | "observation";
}>;

export type V3DebugPerformanceSection = Readonly<{
  stageTimings: readonly V3StageTiming[];
  knowledgeLoadingTimeMs: number | null;
  reasoningTimeMs: number | null;
  mappingTimeMs: number | null;
  findingGenerationTimeMs: number | null;
}>;

export type V3DebugOutputSection = Readonly<{
  findings: readonly V3RuntimeFinding[];
  observations: readonly string[];
  confidence: number;
  diagnosticsHashes: Readonly<{
    promptHash: string;
    semanticHash: string;
    legalHash: string;
    rawResponseHash: string | null;
    executionSignatureHash: string | null;
  }>;
}>;

export type V3DebugTimelineEntry = Readonly<{
  stage: V3StageTiming["stage"];
  durationMs: number | null;
  hash: string | null;
  label: string;
  order: number;
}>;

export type V3DebugSummary = Readonly<{
  headline: string;
  counts: Readonly<{
    lessons: number;
    reviewerPacks: number;
    patternLibraries: number;
    decisionRecords: number;
    blueprints: number;
    concepts: number;
    entities: number;
    targets: number;
    intents: number;
    contexts: number;
    evidenceItems: number;
    findings: number;
    observations: number;
  }>;
  confidenceLabel: string;
  keyTakeaways: readonly string[];
}>;

export type V3DebugReasoningTraceSection = Readonly<{
  traces: readonly V3ReasoningTrace[];
}>;

export type V3DebugReport = Readonly<{
  hash: string;
  general: V3DebugGeneralSection;
  academy: V3DebugAcademySection;
  intelligence: V3DebugIntelligenceSection;
  reviewer: V3DebugReviewerSection;
  legal: V3DebugLegalSection;
  gcamMapping: V3DebugGcamMappingSection;
  reviewerJudgment: V3DebugReviewerJudgmentSection;
  reasoningChain: V3DebugReasoningChainSection;
  knowledgeUsage: V3DebugKnowledgeUsageSection;
  findingGeneration: V3DebugFindingGenerationSection;
  performance: V3DebugPerformanceSection;
  reasoningTrace: V3DebugReasoningTraceSection;
  output: V3DebugOutputSection;
  timeline: readonly V3DebugTimelineEntry[];
  summary: V3DebugSummary;
}>;

export type V3DebugCollectorInput = Readonly<{
  analysisResponse: AnalysisResponse;
  findings?: readonly V3RuntimeFinding[];
  observations?: readonly string[];
  reviewerQuestionsAsked?: readonly string[];
  evidenceCollected?: readonly string[];
  discardedHypotheses?: readonly string[];
  acceptedHypotheses?: readonly string[];
  confidenceEvolution?: readonly Readonly<{ stage: string; confidence: number; note?: string | null }>[];
  engineVersion?: string;
  provider?: string;
  model?: string;
  executionTimeMs?: number | null;
  totalPromptSize?: number | null;
  totalCompletionSize?: number | null;
  rawResponseHash?: string | null;
  executionSignatureHash?: string | null;
  finalArticle?: number | null;
  candidateGcamArticles?: readonly number[];
  academyRootDir?: string;
  truthLayerMeta?: Readonly<Record<string, unknown>> | null;
  knowledgeUsage?: Readonly<{
    lessonsUsed?: readonly string[];
    patternsUsed?: readonly string[];
    decisionRecordsUsed?: readonly string[];
    benchmarksReferenced?: readonly string[];
    knowledgeAcquisitionRecords?: readonly string[];
  }> | null;
  performance?: Readonly<{
    knowledgeLoadingTimeMs?: number | null;
    reasoningTimeMs?: number | null;
    mappingTimeMs?: number | null;
    findingGenerationTimeMs?: number | null;
  }> | null;
}>;

export type V3DebugCollection = Readonly<{
  general: V3DebugGeneralSection;
  academy: V3DebugAcademySection;
  intelligence: V3DebugIntelligenceSection;
  reviewer: V3DebugReviewerSection;
  legal: V3DebugLegalSection;
  gcamMapping: V3DebugGcamMappingSection;
  reviewerJudgment: V3DebugReviewerJudgmentSection;
  reasoningChain: V3DebugReasoningChainSection;
  knowledgeUsage: V3DebugKnowledgeUsageSection;
  findingGeneration: V3DebugFindingGenerationSection;
  performance: V3DebugPerformanceSection;
  reasoningTrace: V3DebugReasoningTraceSection;
  output: V3DebugOutputSection;
  timeline: readonly V3DebugTimelineEntry[];
  summary: V3DebugSummary;
  hash: string;
}>;

export type V3DebugAssetType =
  | ReviewerKnowledgeLesson
  | ReviewerKnowledgePack
  | PatternLibraryDocument
  | DecisionRecord;
