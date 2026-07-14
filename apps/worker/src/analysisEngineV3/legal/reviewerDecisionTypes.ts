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

export type ReviewerDecisionContext = Readonly<{
  knowledgeAssets: ReviewerDecisionKnowledgeAssets | null;
  gcamMapping: Readonly<Record<string, unknown>> | null;
  narrativeReasoning: readonly string[];
  intentReasoning: readonly string[];
  relationshipReasoning: readonly string[];
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

