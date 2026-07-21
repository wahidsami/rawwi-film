import type { SceneAnalysisArticleCandidate, SceneAnalysisConcept } from "../sceneAnalysisState.js";

export type LegalDecisionKnowledgeSource = string;

export type LegalDecision = Readonly<{
  id: string;
  conceptId: string;
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  primaryArticle: SceneAnalysisArticleCandidate | null;
  secondaryArticles: readonly SceneAnalysisArticleCandidate[];
  mappingReason: string;
  mappingConfidence: number;
  knowledgeSource: LegalDecisionKnowledgeSource;
}>;

export type LegalDecisionCollection = Readonly<{
  sceneId: string;
  conceptIds: readonly string[];
  decisions: readonly LegalDecision[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedCandidateArticles: readonly SceneAnalysisArticleCandidate[];
  primaryArticle: SceneAnalysisArticleCandidate | null;
  secondaryArticles: readonly SceneAnalysisArticleCandidate[];
  supportingArticles: readonly SceneAnalysisArticleCandidate[];
  knowledgeSource: LegalDecisionKnowledgeSource;
  confidence: number;
  executionTimeMs: number;
}>;

export function createLegalDecision(input: LegalDecision): LegalDecision {
  return Object.freeze({
    ...input,
    candidateArticles: Object.freeze([...input.candidateArticles]),
    secondaryArticles: Object.freeze([...input.secondaryArticles]),
  });
}

export function createLegalDecisionCollection(input: LegalDecisionCollection): LegalDecisionCollection {
  return Object.freeze({
    ...input,
    conceptIds: Object.freeze([...input.conceptIds]),
    decisions: Object.freeze([...input.decisions]),
    candidateArticles: Object.freeze([...input.candidateArticles]),
    rankedCandidateArticles: Object.freeze([...input.rankedCandidateArticles]),
    secondaryArticles: Object.freeze([...input.secondaryArticles]),
    supportingArticles: Object.freeze([...input.supportingArticles]),
  });
}

export function legalDecisionPrimaryArticle(decision: LegalDecision): SceneAnalysisArticleCandidate | null {
  return decision.primaryArticle;
}

export function legalDecisionConcept(input: SceneAnalysisConcept | null | undefined): string {
  return input?.conceptId ?? "unknown";
}

