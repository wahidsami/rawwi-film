import { getPolicyArticle } from "../policyMap.js";
import { createDefaultReviewerKnowledgeRegistry } from "../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { getReviewerScopeDeclaration } from "../analysisEngineV3/reviewerKnowledge/reviewerScopeMatrix.js";
import type { ReviewerKnowledgePack } from "../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeTypes.js";
import type {
  SceneAnalysisArticleCandidate,
  SceneAnalysisConcept,
  SceneAnalysisState,
} from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

type PackMatchKind = "exact" | "domain";

function normalizeToken(value: string): string {
  return value.normalize("NFC").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function getPackFolder(pack: ReviewerKnowledgePack): string {
  return getReviewerScopeDeclaration(pack.module_id)?.folder ?? normalizeToken(pack.module_id.replace(/^v[0-9]+_[0-9]+_/, ""));
}

function matchesExactTrigger(pack: ReviewerKnowledgePack, concept: SceneAnalysisConcept): boolean {
  const conceptTokens = new Set([
    normalizeToken(concept.conceptId),
    normalizeToken(concept.label),
    ...concept.knowledgeDomains.map((domain) => normalizeToken(domain)),
  ]);

  return pack.trigger_concept_ids.some((trigger) => {
    const normalizedTrigger = normalizeToken(trigger);
    for (const token of conceptTokens) {
      if (normalizedTrigger === token) return true;
      if (normalizedTrigger.startsWith(`${token}_`)) return true;
      if (token.startsWith(`${normalizedTrigger}_`)) return true;
    }
    return false;
  });
}

function matchesKnowledgeDomain(pack: ReviewerKnowledgePack, concept: SceneAnalysisConcept): boolean {
  const folder = normalizeToken(getPackFolder(pack));
  const conceptTokens = new Set([
    normalizeToken(concept.conceptId),
    normalizeToken(concept.label),
    ...concept.knowledgeDomains.map((domain) => normalizeToken(domain)),
  ]);

  for (const token of conceptTokens) {
    if (folder === token) return true;
    if (folder.startsWith(`${token}_`)) return true;
    if (token.startsWith(`${folder}_`)) return true;
  }

  return false;
}

function roleWeight(role: string): number {
  const normalized = normalizeToken(role);
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

function baseMatchWeight(matchKind: PackMatchKind): number {
  return matchKind === "exact" ? 200 : 100;
}

function mappingPositionWeight(position: number): number {
  return Math.max(0, 40 - (position * 8));
}

type LegalMappingAccumulator = {
  articleId: number;
  titleAr: string;
  matchedKnowledgeDomains: Set<string>;
  matchedConceptIds: Set<string>;
  score: number;
  rationale: string[];
};

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
  matchKind: PackMatchKind,
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

function resolveLegalArticleCandidates(
  concepts: readonly SceneAnalysisConcept[],
): readonly SceneAnalysisArticleCandidate[] {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const packs = registry.list();
  const buckets = new Map<number, LegalMappingAccumulator>();

  for (const concept of concepts) {
    const exactPacks = packs.filter((pack) => matchesExactTrigger(pack, concept));
    const candidatePacks = exactPacks.length > 0
      ? exactPacks.map((pack) => ({ pack, matchKind: "exact" as const }))
      : packs
        .filter((pack) => matchesKnowledgeDomain(pack, concept))
        .map((pack) => ({ pack, matchKind: "domain" as const }));

    for (const { pack, matchKind } of candidatePacks) {
      const packFolder = getPackFolder(pack);
      for (const [position, mapping] of pack.article_mapping.entries()) {
        const articleId = mapping.article_id;
        const accumulator = buckets.get(articleId) ?? createAccumulator(articleId);
        if (!accumulator) {
          continue;
        }

        if (concept.knowledgeDomains.length > 0) {
          for (const domain of concept.knowledgeDomains) {
            if (normalizeToken(domain) === normalizeToken(packFolder)) {
              accumulator.matchedKnowledgeDomains.add(domain);
            }
          }
        }

        contributeMapping(accumulator, concept, pack, mapping.role, matchKind, position);
        buckets.set(articleId, accumulator);
      }
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
        evidenceSpanIds: Object.freeze([]),
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

export function createLegalMappingNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const legalCandidateArticles = resolveLegalArticleCandidates(state.detectedConcepts);
    const split = splitArticles(legalCandidateArticles);

    return freezeSceneAnalysisState({
      ...state,
      legalCandidateArticles,
      legalPrimaryArticle: split.primaryArticle,
      legalSecondaryArticles: split.secondaryArticles,
      legalSupportingArticles: split.supportingArticles,
      candidateArticles: legalCandidateArticles,
      rankedCandidateArticles: legalCandidateArticles,
      primaryArticle: split.primaryArticle,
      secondaryArticles: split.secondaryArticles,
    });
  };
}
