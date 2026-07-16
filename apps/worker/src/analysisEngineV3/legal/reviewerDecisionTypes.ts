import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import type { LegalModuleInput, LegalModuleId, LegalEvaluationStatus, LegalSemanticResult, LegalNarrativeResult, LegalEvidenceResult, LegalContextResult } from "./legalTypes.js";
import type { LegalDecision, LegalExceptionResult, LegalFinding } from "./legalResult.js";

export type ReviewerDecisionKnowledgeAssets = Readonly<{
  lessons: readonly string[];
  decisionRecords: readonly string[];
  patternLibraries: readonly string[];
  benchmarks: readonly string[];
  reviewerKnowledge: readonly string[];
  gcamMappings: readonly string[];
  narrativeReasoning: readonly string[];
  intentReasoning: readonly string[];
  relationshipReasoning: readonly string[];
}>;

export type ReviewerDecisionReasoningStage = Readonly<{
  key: string;
  title: string;
  purpose: string;
  summary: string;
  confidence: number;
  inputs: readonly string[];
  outputs: readonly string[];
  evidence: readonly string[];
  knowledge: readonly string[];
}>;

export type ReviewerDecisionPreliminaryDecision = Readonly<{
  status: ReviewerDecisionStatus;
  reason: string;
  confidence: number;
  applicableArticles: readonly number[];
  rejectedArticles: readonly number[];
}>;

export type ReviewerDecisionReasoning = Readonly<{
  literalMeaning: string;
  impliedMeaning: string;
  narrativeContext: string;
  speakerAnalysis: string;
  victimAnalysis: string;
  socialImpact: string;
  applicableGcamArticles: readonly number[];
  rejectedGcamArticles: readonly number[];
  supportingEvidence: readonly string[];
  counterEvidence: readonly string[];
  confidenceExplanation: string;
  preliminaryDecision: ReviewerDecisionPreliminaryDecision;
  stages: readonly ReviewerDecisionReasoningStage[];
}>;

export type ReviewerDecisionContext = Readonly<{
  knowledgeAssets: ReviewerDecisionKnowledgeAssets | null;
  gcamMapping: Readonly<Record<string, unknown>> | null;
  narrativeReasoning: readonly string[];
  intentReasoning: readonly string[];
  relationshipReasoning: readonly string[];
  reasoning: ReviewerDecisionReasoning;
}>;

export type ReviewerDecisionEvaluationInput = Readonly<
  LegalModuleInput & {
    readonly intelligence: IntelligenceContext;
    readonly reviewerDecision?: ReviewerDecisionContext | null;
  }
>;

export type ReviewerDecisionModuleSurface = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly articleIds: readonly number[];
}>;

export type ReviewerDecisionModuleResult = LegalDecision;
export type ReviewerDecisionExceptionResult = LegalExceptionResult;
export type ReviewerDecisionFinding = LegalFinding;
export type ReviewerDecisionStatus = LegalEvaluationStatus;
export type ReviewerDecisionModuleId = LegalModuleId;
