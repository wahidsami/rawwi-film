import type {
  ReviewerCanonicalArticleOwnershipMap,
  ReviewerKnowledgeDomainCandidateArticleSetMap,
  ReviewerKnowledgeRegistry,
} from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import {
  buildCanonicalArticleOwnershipMap,
  buildKnowledgeDomainCandidateArticleSetMap,
  createDefaultReviewerKnowledgeRegistry,
} from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type { ReviewerKnowledgePack } from "../../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeTypes.js";
import type { SceneAnalysisConcept } from "../sceneAnalysisState.js";

export type LegalKnowledgeSource = Readonly<{
  knowledgeSourceId: string;
  registryHash: string;
  packCount: number;
  candidateArticleSetMap: ReviewerKnowledgeDomainCandidateArticleSetMap;
  canonicalOwnershipMap: ReviewerCanonicalArticleOwnershipMap;
}>;

export type LegalPackMatchKind = "exact" | "domain";

export type LegalPackMatch = Readonly<{
  pack: ReviewerKnowledgePack;
  matchKind: LegalPackMatchKind;
}>;

function normalizeToken(value: string): string {
  return value.normalize("NFC").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function getPackFolder(pack: ReviewerKnowledgePack): string {
  return normalizeToken(pack.module_id.replace(/^v[0-9]+_[0-9]+_/, ""));
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

export function createLegalKnowledgeSource(
  registry: ReviewerKnowledgeRegistry = createDefaultReviewerKnowledgeRegistry(),
): LegalKnowledgeSource {
  return Object.freeze({
    knowledgeSourceId: `academy:${registry.hash}`,
    registryHash: registry.hash,
    packCount: registry.list().length,
    candidateArticleSetMap: buildKnowledgeDomainCandidateArticleSetMap(registry),
    canonicalOwnershipMap: buildCanonicalArticleOwnershipMap(registry),
  });
}

export function resolveConceptPackMatches(
  concept: SceneAnalysisConcept,
  registry: ReviewerKnowledgeRegistry,
): readonly LegalPackMatch[] {
  const packs = registry.list();
  const exactPacks = packs.filter((pack) => matchesExactTrigger(pack, concept));
  const candidatePacks = exactPacks.length > 0
    ? exactPacks.map((pack) => ({ pack, matchKind: "exact" as const }))
    : packs
      .filter((pack) => matchesKnowledgeDomain(pack, concept))
      .map((pack) => ({ pack, matchKind: "domain" as const }));

  return Object.freeze(candidatePacks);
}

export function resolveConceptCandidateArticleIds(
  concept: SceneAnalysisConcept,
  knowledgeSource: LegalKnowledgeSource,
): readonly number[] {
  const candidateSet = new Set<number>();
  for (const domain of concept.knowledgeDomains) {
    const mappedArticleIds = knowledgeSource.candidateArticleSetMap[normalizeToken(domain)] ?? [];
    for (const articleId of mappedArticleIds) {
      candidateSet.add(articleId);
    }
  }

  return Object.freeze([...candidateSet].sort((left, right) => left - right));
}

export function normalizeLegalToken(value: string): string {
  return normalizeToken(value);
}

export function getLegalPackFolder(pack: ReviewerKnowledgePack): string {
  return getPackFolder(pack);
}

export function matchesLegalExactTrigger(pack: ReviewerKnowledgePack, concept: SceneAnalysisConcept): boolean {
  return matchesExactTrigger(pack, concept);
}

export function matchesLegalKnowledgeDomain(pack: ReviewerKnowledgePack, concept: SceneAnalysisConcept): boolean {
  return matchesKnowledgeDomain(pack, concept);
}
