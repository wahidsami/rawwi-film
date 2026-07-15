import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeDiagnostics } from "../runtime/runtimeDiagnostics.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type { ArbitrationDecisionPackage } from "../arbitration/arbitrationTypes.js";
import type { ReviewerDebateOpinion, ReviewerDebatePackage } from "../reviewerDebate/reviewerDebateTypes.js";

export type ExplanationKnowledgeBundle = Readonly<{
  lessons: readonly string[];
  patterns: readonly string[];
  blueprints: readonly string[];
  relationships: readonly string[];
  cases: readonly string[];
  precedents: readonly string[];
}>;

export type ExplanationCompletenessScores = Readonly<{
  explanation: number;
  references: number;
  knowledge: number;
  evidence: number;
  reasoning: number;
}>;

export type ExplanationReviewerOpinion = Readonly<{
  reviewerId: string;
  reviewerName: string;
  status: ReviewerDebateOpinion["status"];
  confidence: number;
  reasoning: string;
  supportingEvidence: readonly string[];
  supportingKnowledge: ExplanationKnowledgeBundle;
  suggestedArticles: readonly number[];
  rejectedArticles: readonly number[];
  riskLevel: ReviewerDebateOpinion["riskLevel"];
  needsHumanReview: boolean;
}>;

export type ExplanationFinding = Readonly<{
  findingIndex: number;
  findingKey: string;
  findingId: string;
  articleId: number;
  atomId: string | null;
  title: string;
  category: string;
  semanticReasoning: Readonly<{
    semanticMeaning: string;
    narrativeIntent: string;
    riskContext: string;
    conversationRole: string;
    sceneRole: string;
    speaker: string | null;
    listener: string | null;
    target: string | null;
    victim: string | null;
    confidence: number;
  }>;
  knowledgeUsed: ExplanationKnowledgeBundle;
  reviewerOpinions: readonly ExplanationReviewerOpinion[];
  winningReviewer: Readonly<{
    reviewerId: string;
    reviewerName: string;
    status: string;
    confidence: number;
  }>;
  rejectedReviewers: readonly Readonly<{
    reviewerId: string;
    reviewerName: string;
    reason: string;
    status: string;
    confidence: number;
  }>[];
  confidenceExplanation: Readonly<{
    semantic: number;
    evidence: number;
    legal: number;
    debate: number;
    arbitration: number;
    final: number;
    adjustment: number;
  }>;
  applicableArticles: readonly number[];
  rejectedArticles: readonly number[];
  counterarguments: readonly string[];
  evidenceChain: readonly string[];
  reasoningChain: readonly string[];
  inspectionReferences: readonly string[];
  completeness: ExplanationCompletenessScores;
}>;

export type ExplanationPackage = Readonly<{
  jobId: string;
  chunkId: string;
  analysisEngine: "v3";
  pipelineVersion: string;
  findingCount: number;
  winningReviewer: Readonly<{
    reviewerId: string;
    reviewerName: string;
    status: string;
    confidence: number;
  }>;
  rejectedReviewers: readonly Readonly<{
    reviewerId: string;
    reviewerName: string;
    reason: string;
    status: string;
    confidence: number;
  }>[];
  findings: readonly ExplanationFinding[];
  summary: Readonly<{
    explanationCompleteness: number;
    referenceCompleteness: number;
    knowledgeCompleteness: number;
    evidenceCompleteness: number;
    reasoningCompleteness: number;
    applicableArticles: readonly number[];
    rejectedArticles: readonly number[];
  }>;
  metrics: Readonly<{
    explanationCompleteness: number;
    referenceCompleteness: number;
    knowledgeCompleteness: number;
    evidenceCompleteness: number;
    reasoningCompleteness: number;
  }>;
  inspectionReferences: readonly string[];
  diagnostics: V3RuntimeDiagnostics;
  analysisResponse: AnalysisResponse;
  reviewerDebate: ReviewerDebatePackage;
  arbitration: ArbitrationDecisionPackage;
}>;

export type ExplanationEngineInput = Readonly<{
  jobId: string;
  chunkId: string;
  pipelineVersion: string;
  analysisResponse: AnalysisResponse;
  findings: readonly V3RuntimeFinding[];
  reviewerDebate: ReviewerDebatePackage;
  arbitration: ArbitrationDecisionPackage;
  diagnostics: V3RuntimeDiagnostics;
}>;
