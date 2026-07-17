import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ProviderRawResponse } from "../provider/providerTypes.js";
import type { V3ReasonedDecisionValidationResult } from "../provider/reasonedDecisionValidation.js";
import type { ReviewerScopeValidatorResult } from "../runtime/reviewerScopeValidator.js";
import type { ReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import type { EmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import type { ReviewerCompiledContext } from "../reviewerCompiler/compilerTypes.js";
import type { ReviewerCandidateSelectionDiagnostics } from "../ranking/rankingTypes.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { ReviewerDecisionContext } from "../legal/reviewerDecisionTypes.js";
import type { ReviewerDebatePackage } from "../reviewerDebate/reviewerDebateTypes.js";
import type { ArbitrationDecisionPackage } from "../arbitration/arbitrationTypes.js";
import type { ExplanationPackage } from "../explanation/explanationTypes.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { V3RuntimeDiagnostics } from "../runtime/runtimeDiagnostics.js";
import type { GcamMapperResult } from "../reviewerKnowledge/gcamMapper/schemas/gcamMapperTypes.js";

export type V3ReasoningTraceStageName =
  | "scene"
  | "extracted_evidence"
  | "detected_keywords"
  | "detected_semantic_tags"
  | "detected_entities"
  | "reviewer_candidates"
  | "reviewer_selection"
  | "article_candidates"
  | "article_selection"
  | "atom_candidates"
  | "atom_selection"
  | "prompt_summary"
  | "provider_response"
  | "validator_decisions"
  | "final_finding";

export type V3ReasoningTraceCandidate = Readonly<{
  id: string;
  label: string;
  score: number;
  confidence: number;
  why: string;
  reasons: readonly string[];
  selected: boolean;
}>;

export type V3ReasoningTraceStage = Readonly<{
  stage: V3ReasoningTraceStageName;
  order: number;
  title: string;
  why: string;
  inputCount: number | null;
  outputCount: number | null;
  payload: Readonly<Record<string, unknown>>;
}>;

export type V3ReasoningTraceTimelineEntry = Readonly<{
  stage: V3ReasoningTraceStageName;
  order: number;
  durationMs: number | null;
  note: string;
}>;

export type V3ReasoningTracePromptSummary = Readonly<{
  promptHash: string;
  userPromptHash: string;
  promptLengthChars: number;
  userPromptLengthChars: number;
  estimatedPromptTokens: number;
  promptPreview: string;
  promptSummary: string;
}>;

export type V3ReasoningTraceProviderResponse = Readonly<{
  providerName: string;
  modelName: string;
  modelVersion: string | null;
  responseId: string | null;
  responseTimestamp: string | null;
  finishReason: string | null;
  usage: Readonly<{
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  }> | null;
  rawResponseHash: string;
  rawResponseChars: number;
  parsedStatus: string;
  parsedConfidence: number;
  parsedReasoning: string;
  parsedArticles: readonly number[];
}>;

export type V3ReasoningTraceValidationDecision = Readonly<{
  name: string;
  valid: boolean;
  reason: string;
  issues: readonly Readonly<{
    code: string;
    path: string;
    message: string;
  }>[];
  lineOfCode: string | null;
}>;

export type V3ReasoningTraceValidatorDecisions = Readonly<{
  grounding: V3ReasoningTraceValidationDecision;
  scope: Readonly<{
    valid: boolean;
    reason: string;
    selectedReviewers: readonly string[];
    rejectedReviewers: readonly string[];
    acceptedFindingsCount: number;
    rejectedFindingsByScopeCount: number;
    lineOfCode: string | null;
  }>;
  mapping: Readonly<{
    decisionStatus: string;
    decisionArticle: number | null;
    decisionAtom: string | null;
    decisionReason: string;
    validatorHistory: readonly string[];
    acceptedCount: number;
    rejectedCount: number;
    droppedCount: number;
    lineOfCode: string | null;
  }>;
  rejectionReasons: readonly string[];
}>;

export type V3ReasoningTraceFinding = Readonly<{
  findingIndex: number;
  findingKey: string;
  findingId: string;
  articleId: number;
  atomId: string | null;
  category: string;
  scene: Readonly<Record<string, unknown>>;
  extractedEvidence: readonly Readonly<{
    text: string;
    quote: string;
    startOffset: number;
    endOffset: number;
    confidence: number;
    source: string;
    concepts: readonly string[];
    entities: readonly string[];
    reason: string;
  }>[];
  detectedKeywords: readonly string[];
  detectedSemanticTags: readonly string[];
  detectedEntities: readonly Readonly<{
    id: string;
    label: string;
    role: string;
    source: string;
    confidence: number;
    evidence: string | null;
  }>[];
  reviewerCandidates: readonly V3ReasoningTraceCandidate[];
  reviewerSelectionReason: string;
  articleCandidates: readonly V3ReasoningTraceCandidate[];
  articleSelectionReason: string;
  atomCandidates: readonly V3ReasoningTraceCandidate[];
  atomSelectionReason: string;
  promptSummary: V3ReasoningTracePromptSummary;
  providerResponse: V3ReasoningTraceProviderResponse;
  validatorDecisions: V3ReasoningTraceValidatorDecisions;
  finalFinding: Readonly<Record<string, unknown>> | null;
  stages: readonly V3ReasoningTraceStage[];
  decisionTimeline: readonly V3ReasoningTraceTimelineEntry[];
  promptLengthChars: number;
  promptTokens: number;
  payloadSizeChars: number;
  traceHash: string;
}>;

export type V3ReasoningReplayFirstIncorrectDecision = Readonly<{
  stage: V3ReasoningTraceStageName;
  reason: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type V3ReasoningReplay = Readonly<{
  jobId: string;
  findingId: string;
  findingKey: string;
  timeline: readonly V3ReasoningTraceTimelineEntry[];
  stages: readonly V3ReasoningTraceStage[];
  firstIncorrectDecision: V3ReasoningReplayFirstIncorrectDecision | null;
  trace: V3ReasoningTraceFinding | null;
}>;

export type V3ReasoningMetrics = Readonly<{
  reviewerAccuracy: number;
  articleAccuracy: number;
  atomAccuracy: number;
  validatorRejectionReasons: Readonly<Record<string, number>>;
  promptSizeChars: number;
  promptTokens: number;
  decisionTimeline: readonly V3ReasoningTraceTimelineEntry[];
}>;

export type V3ReasoningTraceInput = Readonly<{
  jobId: string;
  chunkId: string;
  findingKey: string;
  analysisResponse: AnalysisResponse;
  findings: readonly V3RuntimeFinding[];
  promptInput: V3PromptBuilderInput;
  renderedPrompt: Readonly<{
    prompt: string;
    promptHash: string;
  }>;
  userPrompt: string;
  rawResponse: V3ProviderRawResponse;
  groundingValidation: V3ReasonedDecisionValidationResult;
  scopeValidation: ReviewerScopeValidatorResult;
  reviewerKnowledgeSelection: EmergencyContextualReviewerKnowledgeSelection;
  reviewerKnowledgeRetrieval: ReviewerKnowledgeRetrievalReport;
  reviewerCompiledContext: ReviewerCompiledContext | null;
  candidateDiagnostics: ReviewerCandidateSelectionDiagnostics | null;
  reviewerDecision: ReviewerDecisionContext;
  legalDecision: LegalDecision;
  validatedLegalDecision: LegalDecision;
  gcamMapping: GcamMapperResult;
  reviewerDebate: ReviewerDebatePackage;
  arbitration: ArbitrationDecisionPackage;
  explanation: ExplanationPackage;
  diagnostics: V3RuntimeDiagnostics;
}>;
