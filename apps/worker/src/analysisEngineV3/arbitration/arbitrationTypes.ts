import type { LegalDecision } from "../legal/legalDecision.js";
import type {
  ReviewerDebateConfidenceDistribution,
  ReviewerDebateMetrics,
  ReviewerDebateOpinion,
  ReviewerDebatePackage,
  ReviewerDebatePairwiseAssessment,
} from "../reviewerDebate/reviewerDebateTypes.js";

export type ArbitrationKnowledgeBundle = Readonly<{
  lessons: readonly string[];
  blueprints: readonly string[];
  patterns: readonly string[];
  precedents: readonly string[];
  cases: readonly string[];
  relationships: readonly string[];
}>;

export type ArbitrationReviewerRef = Readonly<{
  reviewerId: string;
  reviewerName: string;
  status: LegalDecision["status"];
  confidence: number;
}>;

export type ArbitrationRejectedReviewer = Readonly<{
  reviewerId: string;
  reviewerName: string;
  reason: string;
  status: LegalDecision["status"];
  confidence: number;
}>;

export type ArbitrationDecisionPackage = Readonly<{
  debate: ReviewerDebatePackage;
  winningReviewer: ArbitrationReviewerRef;
  winningOpinion: ReviewerDebateOpinion;
  winningOpinionIndex: number;
  winningReason: string;
  winningEvidence: readonly string[];
  winningKnowledge: ArbitrationKnowledgeBundle;
  winningLessons: readonly string[];
  winningBlueprints: readonly string[];
  winningPatterns: readonly string[];
  winningPrecedents: readonly string[];
  winningCases: readonly string[];
  winningRelationships: readonly string[];
  winningArticle: number | null;
  finalArticle: number | null;
  rejectedReviewers: readonly ArbitrationRejectedReviewer[];
  rejectedReasons: readonly string[];
  confidence: number;
  confidenceAdjustment: number;
  confidenceCalibration?: Readonly<{
    baseConfidence: number;
    semanticConfidence: number;
    knowledgeConfidence: number;
    precedentAgreement: number;
    reviewerAgreement: number;
    evidenceQuality: number;
    counterEvidence: number;
    narrativeAmbiguity: number;
    consensusScore: number;
    disagreementScore: number;
    positiveAverage: number;
    negativeAverage: number;
    adjustedSignal: number;
    confidence: number;
    adjustment: number;
    cappedAtMaximum: boolean;
  }> | null;
  consensusScore: number;
  agreementMatrix: readonly ReviewerDebatePairwiseAssessment[];
  disagreementMatrix: readonly ReviewerDebatePairwiseAssessment[];
  confidenceDistribution: ReviewerDebateConfidenceDistribution;
  metrics: ReviewerDebateMetrics;
  conflicts: readonly number[];
  needsHumanReview: boolean;
  escalationRecommendation: string;
  decisionExplanation: string;
  decisionDurationMs: number;
  finalDecisionStatus: LegalDecision["status"];
}>;

export type ArbitrationJudgeInput = Readonly<{
  debate: ReviewerDebatePackage;
}>;
