import type { ReviewerKnowledgeRegistry } from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { createDefaultReviewerKnowledgeRegistry } from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type { ConceptRecord, ConceptCollection } from "../concepts/conceptTypes.js";
import type {
  SceneAnalysisArticleCandidate,
  SceneAnalysisConcept,
  SceneAnalysisState,
} from "../sceneAnalysisState.js";
import type { LegalDecision, LegalDecisionCollection } from "./legalDecision.js";
import { createLegalDecision, createLegalDecisionCollection } from "./legalDecision.js";
import { createLegalKnowledgeSource, type LegalKnowledgeSource } from "./legalKnowledge.js";
import { rankLegalConceptArticles } from "./legalRanker.js";

export type LegalMappingEngineInput = Readonly<{
  sceneId: string;
  conceptCollection: ConceptCollection | null;
  detectedConcepts: readonly SceneAnalysisConcept[];
  state?: SceneAnalysisState | null;
}>;

export type LegalMappingEngineResult = LegalDecisionCollection;

function normalizeConceptFromRecord(record: ConceptRecord): SceneAnalysisConcept {
  return Object.freeze({
    conceptId: record.conceptId,
    label: record.label,
    knowledgeDomains: Object.freeze([...record.knowledgeDomains]),
    evidenceSpanIds: Object.freeze([...record.evidenceSpanIds]),
    confidence: record.confidence,
    rationale: Object.freeze([...record.rationale]),
  });
}

function uniqueArticles(
  decisions: readonly LegalDecision[],
): readonly SceneAnalysisArticleCandidate[] {
  const bestByArticleId = new Map<number, SceneAnalysisArticleCandidate>();

  for (const decision of decisions) {
    for (const candidate of decision.candidateArticles) {
      const existing = bestByArticleId.get(candidate.articleId);
      if (!existing || candidate.score > existing.score || (candidate.score === existing.score && candidate.articleId < existing.articleId)) {
        bestByArticleId.set(candidate.articleId, candidate);
      }
    }
  }

  return Object.freeze([...bestByArticleId.values()].sort((left, right) => right.score - left.score || left.articleId - right.articleId));
}

function splitArticles(
  candidates: readonly SceneAnalysisArticleCandidate[],
): Readonly<{
  primaryArticle: SceneAnalysisArticleCandidate | null;
  secondaryArticles: readonly SceneAnalysisArticleCandidate[];
  supportingArticles: readonly SceneAnalysisArticleCandidate[];
}> {
  const primaryArticle = candidates[0] ?? null;
  const secondaryArticles = Object.freeze(candidates.slice(1, 3));
  const supportingArticles = Object.freeze(candidates.slice(3));
  return Object.freeze({
    primaryArticle,
    secondaryArticles,
    supportingArticles,
  });
}

function buildDecision(
  concept: SceneAnalysisConcept,
  registry: ReviewerKnowledgeRegistry,
  knowledgeSource: LegalKnowledgeSource,
): LegalDecision {
  const ranked = rankLegalConceptArticles(concept, registry, knowledgeSource);
  return createLegalDecision({
    id: `legal-${concept.conceptId}`,
    conceptId: concept.conceptId,
    candidateArticles: ranked.candidateArticles,
    primaryArticle: ranked.primaryArticle,
    secondaryArticles: ranked.secondaryArticles,
    mappingReason: ranked.mappingReason,
    mappingConfidence: ranked.mappingConfidence,
    knowledgeSource: knowledgeSource.knowledgeSourceId,
  });
}

function resolveConcepts(
  conceptCollection: ConceptCollection | null,
  detectedConcepts: readonly SceneAnalysisConcept[],
): readonly SceneAnalysisConcept[] {
  if (conceptCollection && conceptCollection.concepts.length > 0) {
    return Object.freeze(conceptCollection.concepts.map((concept) => normalizeConceptFromRecord(concept)));
  }
  return Object.freeze([...detectedConcepts]);
}

export function mapLegalDecisions(input: LegalMappingEngineInput): LegalMappingEngineResult {
  const startedAt = Date.now();
  const registry = createDefaultReviewerKnowledgeRegistry();
  const knowledgeSource = createLegalKnowledgeSource(registry);
  const concepts = resolveConcepts(input.conceptCollection, input.detectedConcepts);
  const decisions = Object.freeze(concepts.map((concept) => buildDecision(concept, registry, knowledgeSource)));
  const candidateArticles = uniqueArticles(decisions);
  const split = splitArticles(candidateArticles);
  const confidence = decisions.length > 0
    ? Number((decisions.reduce((sum, decision) => sum + decision.mappingConfidence, 0) / decisions.length).toFixed(6))
    : 0;
  const executionTimeMs = Math.max(0, Date.now() - startedAt);

  return createLegalDecisionCollection({
    sceneId: input.sceneId,
    conceptIds: Object.freeze(concepts.map((concept) => concept.conceptId)),
    decisions,
    candidateArticles,
    rankedCandidateArticles: candidateArticles,
    primaryArticle: split.primaryArticle,
    secondaryArticles: split.secondaryArticles,
    supportingArticles: split.supportingArticles,
    knowledgeSource: knowledgeSource.knowledgeSourceId,
    confidence,
    executionTimeMs,
  });
}
