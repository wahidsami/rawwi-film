import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalModule } from "../legal/legalModule.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";

export type GPTReviewerAssistant = Readonly<{
  providerName: string;
  modelName: string;
  promptHash: string;
  responseHash: string;
  latencyMs: number;
  reasoning: string;
  alternativeInterpretations: readonly string[];
  confidence: number;
  supportingEvidence: readonly string[];
  contradictingEvidence: readonly string[];
  applicableArticles: readonly number[];
  rejectedArticles: readonly number[];
  riskAnalysis: string;
  narrativeAnalysis: string;
  humanLikeExplanation: string;
}>;

export type ReviewerDebateKnowledgeSupport = Readonly<{
  lessons: readonly string[];
  blueprints: readonly string[];
  patterns: readonly string[];
  relationships: readonly string[];
  cases: readonly string[];
  precedents: readonly string[];
}>;

export type ReviewerDebateOpinion = Readonly<{
  reviewerId: string;
  reviewerName: string;
  moduleId: string;
  moduleTitle: string;
  applicable: boolean;
  status: LegalDecision["status"];
  confidence: number;
  reasoning: string;
  supportingEvidence: readonly string[];
  supportingKnowledge: ReviewerDebateKnowledgeSupport;
  suggestedArticles: readonly number[];
  rejectedArticles: readonly number[];
  counterargument: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  escalationRecommendation: string;
  needsHumanReview: boolean;
  independence: "independent";
  durationMs: number;
}>;

export type ReviewerDebatePairwiseAssessment = Readonly<{
  leftReviewerId: string;
  rightReviewerId: string;
  sameStatus: boolean;
  articleOverlap: number;
  knowledgeOverlap: number;
  evidenceOverlap: number;
  confidenceDelta: number;
  agreementScore: number;
  disagreementScore: number;
}>;

export type ReviewerDebateConfidenceDistribution = Readonly<{
  minimum: number;
  maximum: number;
  average: number;
  median: number;
  spread: number;
  buckets: Readonly<{
    low: number;
    medium: number;
    high: number;
    critical: number;
  }>;
}>;

export type ReviewerDebateMetrics = Readonly<{
  agreement: number;
  disagreement: number;
  averageConfidence: number;
  participation: number;
  articleOverlap: number;
  knowledgeOverlap: number;
  evidenceOverlap: number;
  consensusPercentage: number;
}>;

export type ReviewerDebatePackage = Readonly<{
  sharedPackage: ReviewerReasoningEnginePayload;
  primaryDecision: Readonly<{
    moduleId: string;
    moduleTitle: string;
    status: LegalDecision["status"];
    confidence: number;
    articleIds: readonly number[];
    reason: string;
  }>;
  reviewerCount: number;
  executionOrder: readonly string[];
  reviewerDurations: readonly Readonly<{
    reviewerId: string;
    reviewerName: string;
    durationMs: number;
  }>[];
  opinions: readonly ReviewerDebateOpinion[];
  opinionSummaries: readonly Readonly<{
    reviewerId: string;
    reviewerName: string;
    status: LegalDecision["status"];
    confidence: number;
    applicable: boolean;
    suggestedArticles: readonly number[];
    rejectedArticles: readonly number[];
    riskLevel: ReviewerDebateOpinion["riskLevel"];
    needsHumanReview: boolean;
  }>[];
  agreementMatrix: readonly ReviewerDebatePairwiseAssessment[];
  disagreementMatrix: readonly ReviewerDebatePairwiseAssessment[];
  highestConfidenceReviewer: string | null;
  lowestConfidenceReviewer: string | null;
  conflictingArticles: readonly number[];
  supportingEvidenceOverlap: readonly string[];
  knowledgeOverlap: readonly string[];
  confidenceDistribution: ReviewerDebateConfidenceDistribution;
  consensusScore: number;
  metrics: ReviewerDebateMetrics;
  gptAssistant?: GPTReviewerAssistant | null;
}>;

export type ReviewerDebateEngineInput = Readonly<{
  analysisResponse: AnalysisResponse;
  legalModules: readonly LegalModule[];
  reviewerReasoningEngine: ReviewerReasoningEnginePayload;
  gptAssistant?: GPTReviewerAssistant | null;
}>;
