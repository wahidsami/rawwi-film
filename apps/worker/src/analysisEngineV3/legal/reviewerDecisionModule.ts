import type { LegalDecision } from "./legalDecision.js";
import type { LegalExceptionResult, LegalFinding } from "./legalResult.js";
import type { LegalModule } from "./legalModule.js";
import type { ReviewerDecisionContext, ReviewerDecisionEvaluationInput, ReviewerDecisionModuleSurface, ReviewerDecisionReasoning } from "./reviewerDecisionTypes.js";

export type ReviewerDecisionModuleInput = ReviewerDecisionEvaluationInput;

export interface ReviewerDecisionModule extends LegalModule {
  readonly framework: "reviewer_decision";
}

export abstract class ReviewerDecisionModuleBase implements ReviewerDecisionModule {
  readonly framework = "reviewer_decision" as const;
  readonly id: string;
  readonly title: string;
  readonly articleIds: readonly number[];

  protected constructor(surface: ReviewerDecisionModuleSurface) {
    this.id = surface.id;
    this.title = surface.title;
    this.articleIds = [...surface.articleIds];
  }

  abstract applies(input: ReviewerDecisionModuleInput): boolean;
  abstract evaluate(input: ReviewerDecisionModuleInput): LegalDecision;
  abstract exceptions(input: ReviewerDecisionModuleInput, decision: LegalDecision): readonly LegalExceptionResult[];
  abstract buildFinding(input: ReviewerDecisionModuleInput, decision: LegalDecision, exceptions: readonly LegalExceptionResult[]): LegalFinding | null;

  protected getIntelligence(input: ReviewerDecisionModuleInput) {
    return input.intelligence;
  }

  protected getKnowledgeContext(input: ReviewerDecisionModuleInput): ReviewerDecisionContext | null {
    return input.reviewerDecision ?? null;
  }

  protected getKnowledgeAssets(input: ReviewerDecisionModuleInput) {
    return this.getKnowledgeContext(input)?.knowledgeAssets ?? null;
  }

  protected getGcamMapping(input: ReviewerDecisionModuleInput) {
    return this.getKnowledgeContext(input)?.gcamMapping ?? null;
  }

  protected getLessons(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeAssets(input)?.lessons ?? [];
  }

  protected getDecisionRecords(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeAssets(input)?.decisionRecords ?? [];
  }

  protected getPatternLibraries(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeAssets(input)?.patternLibraries ?? [];
  }

  protected getBenchmarks(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeAssets(input)?.benchmarks ?? [];
  }

  protected getReviewerKnowledge(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeAssets(input)?.reviewerKnowledge ?? [];
  }

  protected getNarrativeReasoning(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeContext(input)?.narrativeReasoning ?? [];
  }

  protected getIntentReasoning(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeContext(input)?.intentReasoning ?? [];
  }

  protected getRelationshipReasoning(input: ReviewerDecisionModuleInput): readonly string[] {
    return this.getKnowledgeContext(input)?.relationshipReasoning ?? [];
  }

  protected getReasoning(input: ReviewerDecisionModuleInput): ReviewerDecisionReasoning | null {
    return this.getKnowledgeContext(input)?.reasoning ?? null;
  }
}

export const BaseReviewerModule = ReviewerDecisionModuleBase;
export const BaseLegalModule = ReviewerDecisionModuleBase;
