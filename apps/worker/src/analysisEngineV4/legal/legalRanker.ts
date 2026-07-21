import { getPolicyArticle } from "../../policyMap.js";
import type { ReviewerKnowledgePack } from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { ReviewerKnowledgeRegistry } from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type { SceneAnalysisArticleCandidate, SceneAnalysisConcept } from "../sceneAnalysisState.js";
import {
  getLegalPackFolder,
  normalizeLegalToken,
  resolveConceptPackMatches,
} from "./legalKnowledge.js";
import type { LegalKnowledgeSource } from "./legalKnowledge.js";

type LegalMappingAccumulator = {
  articleId: number;
  titleAr: string;
  matchedKnowledgeDomains: Set<string>;
  matchedConceptIds: Set<string>;
  score: number;
  rationale: string[];
};

function roleWeight(role: string): number {
  const normalized = normalizeLegalToken(role);
  if (normalized.includes("primary") || normalized.includes("canonical") || normalized.includes("preferred")) {
    return 300;
  }
  if (
    normalized.includes("secondary")
    || normalized.includes("compatibility")
    || normalized.includes("age_rating")
    || normalized.includes("support")
    || normalized.includes("related")
  ) {
    return 180;
  }
  if (
    normalized.includes("dignity")
    || normalized.includes("reputation")
    || normalized.includes("civility")
    || normalized.includes("family")
    || normalized.includes("cohesion")
    || normalized.includes("behavior")
  ) {
    return 140;
  }
  return 100;
}

function baseMatchWeight(matchKind: "exact" | "domain"): number {
  return matchKind === "exact" ? 200 : 100;
}

function mappingPositionWeight(position: number): number {
  return Math.max(0, 40 - (position * 8));
}

function createAccumulator(articleId: number): LegalMappingAccumulator | null {
  const article = getPolicyArticle(articleId);
  if (!article) {
    return null;
  }

  return {
    articleId,
    titleAr: article.title_ar,
    matchedKnowledgeDomains: new Set<string>(),
    matchedConceptIds: new Set<string>(),
    score: 0,
    rationale: [],
  };
}

function contributeMapping(
  accumulator: LegalMappingAccumulator,
  concept: SceneAnalysisConcept,
  pack: ReviewerKnowledgePack,
  role: string,
  matchKind: "exact" | "domain",
  position: number,
): void {
  accumulator.matchedConceptIds.add(concept.conceptId);
  for (const domain of concept.knowledgeDomains) {
    accumulator.matchedKnowledgeDomains.add(domain);
  }

  const scoreDelta = baseMatchWeight(matchKind)
    + roleWeight(role)
    + mappingPositionWeight(position)
    + Math.round(concept.confidence * 100);

  accumulator.score += scoreDelta;
  accumulator.rationale.push(
    `Concept ${concept.label} matched ${pack.title} via ${matchKind} Academy knowledge.`,
    `Academy role: ${role}.`,
    `Score contribution: ${scoreDelta}.`,
  );
}

function scoreConceptArticles(
  concept: SceneAnalysisConcept,
  registry: ReviewerKnowledgeRegistry,
): readonly SceneAnalysisArticleCandidate[] {
  const packs = resolveConceptPackMatches(concept, registry);
  const buckets = new Map<number, LegalMappingAccumulator>();

  for (const { pack, matchKind } of packs) {
    const packFolder = getLegalPackFolder(pack);
    for (const [position, mapping] of pack.article_mapping.entries()) {
      const accumulator = buckets.get(mapping.article_id) ?? createAccumulator(mapping.article_id);
      if (!accumulator) {
        continue;
      }

      if (concept.knowledgeDomains.length > 0) {
        for (const domain of concept.knowledgeDomains) {
          if (normalizeLegalToken(domain) === normalizeLegalToken(packFolder)) {
            accumulator.matchedKnowledgeDomains.add(domain);
          }
        }
      }

      contributeMapping(accumulator, concept, pack, mapping.role, matchKind, position);
      buckets.set(mapping.article_id, accumulator);
    }
  }

  return Object.freeze(
    [...buckets.values()]
      .sort((left, right) => right.score - left.score || left.articleId - right.articleId)
      .map((accumulator) => Object.freeze({
        articleId: accumulator.articleId,
        titleAr: accumulator.titleAr,
        matchedKnowledgeDomains: Object.freeze([...accumulator.matchedKnowledgeDomains].sort((left, right) => left.localeCompare(right))),
        matchedConceptIds: Object.freeze([...accumulator.matchedConceptIds].sort((left, right) => left.localeCompare(right))),
        evidenceSpanIds: Object.freeze([...concept.evidenceSpanIds]),
        score: Number(accumulator.score.toFixed(6)),
        rationale: Object.freeze(accumulator.rationale.length > 0
          ? accumulator.rationale
          : [`Academy knowledge resolved article ${accumulator.articleId} deterministically.`]),
      })),
  );
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

export type LegalRankedConceptArticles = Readonly<{
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedCandidateArticles: readonly SceneAnalysisArticleCandidate[];
  primaryArticle: SceneAnalysisArticleCandidate | null;
  secondaryArticles: readonly SceneAnalysisArticleCandidate[];
  supportingArticles: readonly SceneAnalysisArticleCandidate[];
  mappingReason: string;
  mappingConfidence: number;
}>;

export function rankLegalConceptArticles(
  concept: SceneAnalysisConcept,
  registry: ReviewerKnowledgeRegistry,
  knowledgeSource: LegalKnowledgeSource,
): LegalRankedConceptArticles {
  const candidateArticles = scoreConceptArticles(concept, registry);
  const rankedCandidateArticles = Object.freeze([...candidateArticles].sort((left, right) => right.score - left.score || left.articleId - right.articleId));
  const split = splitArticles(rankedCandidateArticles);
  const mappingConfidence = split.primaryArticle ? Math.min(1, Math.max(0, split.primaryArticle.score / 1000)) : 0;
  const mappingReason = rankedCandidateArticles.length > 0
    ? `Academy knowledge for ${concept.label} resolved ${rankedCandidateArticles.length} candidate article(s) from knowledge domains ${concept.knowledgeDomains.join(", ") || "none"} using ${knowledgeSource.knowledgeSourceId}.`
    : `Academy knowledge for ${concept.label} produced no candidate GCAM articles using ${knowledgeSource.knowledgeSourceId}.`;

  return Object.freeze({
    candidateArticles: rankedCandidateArticles,
    rankedCandidateArticles,
    primaryArticle: split.primaryArticle,
    secondaryArticles: split.secondaryArticles,
    supportingArticles: split.supportingArticles,
    mappingReason,
    mappingConfidence,
  });
}
