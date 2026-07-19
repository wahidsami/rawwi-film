import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack, normalizeReviewerKnowledgePackId } from "./reviewerKnowledgeNormalization.js";
import { loadReviewerKnowledgeDocumentsFromDirectory } from "./reviewerKnowledgeIO.js";
import { loadReviewerAcademyPacks } from "./academy/reviewerAcademyLoader.js";
import { createGcamMapperRegistry } from "./gcamMapper/registry/gcamMapperRegistry.js";
import { getReviewerScopeDeclaration, listReviewerScopeDeclarations, type ReviewerScopeDeclaration } from "./reviewerScopeMatrix.js";
import { hashKnowledgeRegistryValue } from "./knowledgeRegistry/knowledgeRegistryUtils.js";

const READER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ACADEMY_DIRECTORY = join(READER_DIRECTORY, "academy");
const DEFAULT_PACKS: readonly ReviewerKnowledgePack[] = Object.freeze([]);
let cachedDefaultReviewerKnowledgeRegistry: ReviewerKnowledgeRegistry | null = null;
let cachedDefaultGcamMapperRegistry: ReturnType<typeof createGcamMapperRegistry> | null = null;
let cachedDefaultReviewerArticleIdsByFolder: Readonly<Record<string, readonly number[]>> | null = null;
let cachedDefaultKnowledgeDomainCandidateArticleSetMap: ReviewerKnowledgeDomainCandidateArticleSetMap | null = null;

export type ReviewerCanonicalArticleOwner = Readonly<{
  reviewerId: string;
  reviewerLabel: string;
  reviewerPackId: string;
  reviewerFolder: string;
  articleId: number;
  atomIds: readonly string[];
}>;

export type ReviewerCanonicalArticleOwnershipMap = Readonly<Record<string, readonly ReviewerCanonicalArticleOwner[]>>;

export type ReviewerKnowledgeDomainCandidateArticleSetMap = Readonly<Record<string, readonly number[]>>;

type CanonicalOwnerCandidate = Readonly<{
  owner: ReviewerCanonicalArticleOwner;
  priority: number;
}>;

export class ReviewerKnowledgeRegistry {
  private readonly packs = new Map<string, ReviewerKnowledgePack>();
  private hashState = "";

  constructor(entries: readonly ReviewerKnowledgePack[] = DEFAULT_PACKS) {
    for (const entry of entries) {
      this.register(entry);
    }
    this.recomputeHash();
  }

  register(pack: ReviewerKnowledgePack): this {
    const normalized = normalizeReviewerKnowledgePack(pack);
    this.packs.set(normalized.id, normalized);
    this.recomputeHash();
    return this;
  }

  unregister(packId: string): boolean {
    const deleted = this.packs.delete(normalizeReviewerKnowledgePackId(packId));
    if (deleted) {
      this.recomputeHash();
    }
    return deleted;
  }

  load(packId: string): ReviewerKnowledgePack | null {
    return this.packs.get(normalizeReviewerKnowledgePackId(packId)) ?? null;
  }

  list(): readonly ReviewerKnowledgePack[] {
    return Object.freeze([...this.packs.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }

  get hash(): string {
    return this.hashState;
  }

  private recomputeHash(): void {
    this.hashState = hashKnowledgeRegistryValue(this.list().map((pack) => ({
      id: pack.id,
      module_id: pack.module_id,
      title: pack.title,
      article_mapping: pack.article_mapping.map((mapping) => ({
        article_id: mapping.article_id,
        atom_ids: [...mapping.atom_ids],
        role: mapping.role,
      })),
      trigger_concept_ids: [...pack.trigger_concept_ids],
    })));
  }
}

export function createReviewerKnowledgeRegistry(entries?: readonly ReviewerKnowledgePack[]): ReviewerKnowledgeRegistry {
  return new ReviewerKnowledgeRegistry(entries);
}

export function createDefaultReviewerKnowledgeRegistry(selectedFolders?: readonly string[]): ReviewerKnowledgeRegistry {
  if (cachedDefaultReviewerKnowledgeRegistry) {
    if (!selectedFolders || selectedFolders.length === 0) {
      return cachedDefaultReviewerKnowledgeRegistry;
    }
  }

  const packs = selectedFolders && selectedFolders.length > 0
    ? loadReviewerAcademyPacks(ACADEMY_DIRECTORY, selectedFolders)
    : loadReviewerAcademyPacks(ACADEMY_DIRECTORY);

  if (!selectedFolders || selectedFolders.length === 0) {
    cachedDefaultReviewerKnowledgeRegistry = new ReviewerKnowledgeRegistry(packs);
    return cachedDefaultReviewerKnowledgeRegistry;
  }

  return new ReviewerKnowledgeRegistry(packs);
}

function getDefaultGcamMapperRegistry(): ReturnType<typeof createGcamMapperRegistry> {
  if (cachedDefaultGcamMapperRegistry) {
    return cachedDefaultGcamMapperRegistry;
  }

  cachedDefaultGcamMapperRegistry = createGcamMapperRegistry();
  return cachedDefaultGcamMapperRegistry;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildReviewerScopeFolderMap(): ReadonlyMap<string, ReviewerScopeDeclaration> {
  return new Map(listReviewerScopeDeclarations().map((declaration) => [normalizeKey(declaration.folder), declaration] as const));
}

function buildReviewerScopeCategoryMap(): ReadonlyMap<string, ReviewerScopeDeclaration> {
  const entries: Array<readonly [string, ReviewerScopeDeclaration]> = [];
  for (const declaration of listReviewerScopeDeclarations()) {
    entries.push([normalizeKey(declaration.folder), declaration] as const);
    for (const category of declaration.ownedCategories) {
      entries.push([normalizeKey(category), declaration] as const);
    }
  }
  return new Map(entries);
}

function buildReviewerArticleIdsByFolder(registry: ReviewerKnowledgeRegistry): Readonly<Record<string, readonly number[]>> {
  if (registry === cachedDefaultReviewerKnowledgeRegistry && cachedDefaultReviewerArticleIdsByFolder) {
    return cachedDefaultReviewerArticleIdsByFolder;
  }

  const scopeByFolder = buildReviewerScopeFolderMap();
  const articleIdsByFolder: Record<string, Set<number>> = {};
  const gcamArticleMappings = getDefaultGcamMapperRegistry().listArticleMappings();

  for (const articleMapping of gcamArticleMappings) {
    for (const domain of articleMapping.domains) {
      const reviewerScope = scopeByFolder.get(normalizeKey(domain));
      if (!reviewerScope) continue;
      const pack = registry.load(reviewerScope.packId);
      if (!pack) continue;
      const packHasArticle = pack.article_mapping.some((mapping) => mapping.article_id === articleMapping.articleId);
      if (!packHasArticle) continue;
      articleIdsByFolder[reviewerScope.folder] ??= new Set<number>();
      articleIdsByFolder[reviewerScope.folder].add(articleMapping.articleId);
    }
  }

  const result: Record<string, readonly number[]> = {};
  for (const [folder, articleIds] of Object.entries(articleIdsByFolder)) {
    result[folder] = Object.freeze([...articleIds].sort((left, right) => left - right));
  }

  if (registry === cachedDefaultReviewerKnowledgeRegistry) {
    cachedDefaultReviewerArticleIdsByFolder = Object.freeze(result);
    return cachedDefaultReviewerArticleIdsByFolder;
  }

  return Object.freeze(result);
}

export function buildKnowledgeDomainCandidateArticleSetMap(registry: ReviewerKnowledgeRegistry): ReviewerKnowledgeDomainCandidateArticleSetMap {
  if (registry === cachedDefaultReviewerKnowledgeRegistry && cachedDefaultKnowledgeDomainCandidateArticleSetMap) {
    return cachedDefaultKnowledgeDomainCandidateArticleSetMap;
  }

  const articleIdsByFolder = buildReviewerArticleIdsByFolder(registry);
  const candidateByDomain: Record<string, Set<number>> = {};

  for (const declaration of listReviewerScopeDeclarations()) {
    const articleIds = articleIdsByFolder[declaration.folder] ?? [];
    const candidateSet = new Set(articleIds);
    candidateByDomain[normalizeKey(declaration.folder)] ??= new Set<number>();
    for (const articleId of candidateSet) {
      candidateByDomain[normalizeKey(declaration.folder)].add(articleId);
    }

    for (const category of declaration.ownedCategories) {
      const normalizedCategory = normalizeKey(category);
      candidateByDomain[normalizedCategory] ??= new Set<number>();
      for (const articleId of candidateSet) {
        candidateByDomain[normalizedCategory].add(articleId);
      }
    }
  }

  const result: Record<string, readonly number[]> = {};
  for (const [domain, articleIds] of Object.entries(candidateByDomain)) {
    result[domain] = Object.freeze([...articleIds].sort((left, right) => left - right));
  }

  if (registry === cachedDefaultReviewerKnowledgeRegistry) {
    cachedDefaultKnowledgeDomainCandidateArticleSetMap = Object.freeze(result);
    return cachedDefaultKnowledgeDomainCandidateArticleSetMap;
  }

  return Object.freeze(result);
}

export function resolveKnowledgeDomainCandidateArticleIds(registry: ReviewerKnowledgeRegistry, knowledgeDomain: string): readonly number[] {
  const normalizedDomain = normalizeKey(knowledgeDomain);
  if (normalizedDomain.length === 0) return Object.freeze([]);
  const map = buildKnowledgeDomainCandidateArticleSetMap(registry);
  return map[normalizedDomain] ?? Object.freeze([]);
}

function computePackMappingPriority(role: string, note: string): number {
  const normalizedRole = normalizeKey(role);
  const normalizedNote = normalizeKey(note);
  if (normalizedRole.includes("primary") || normalizedNote.includes("canonical") || normalizedNote.includes("preferred")) {
    return 300;
  }
  if (normalizedRole.includes("secondary") || normalizedRole.includes("context guard") || normalizedRole.includes("umbrella") || normalizedRole.includes("general") || normalizedNote.includes("secondary")) {
    return 100;
  }
  return 50;
}

function buildCanonicalOwnerCandidate(
  reviewerScope: ReviewerScopeDeclaration,
  articleId: number,
  atomIds: readonly string[],
  priority: number,
): CanonicalOwnerCandidate {
  return Object.freeze({
    owner: Object.freeze({
      reviewerId: reviewerScope.reviewerId,
      reviewerLabel: reviewerScope.label,
      reviewerPackId: reviewerScope.packId,
      reviewerFolder: reviewerScope.folder,
      articleId,
      atomIds: Object.freeze([...new Set(atomIds.map((atomId) => atomId.trim()).filter((atomId) => atomId.length > 0))].sort((left, right) => left.localeCompare(right))),
    }),
    priority,
  });
}

function resolveCanonicalOwnerFromGcamMapping(
  registry: ReviewerKnowledgeRegistry,
  articleMapping: ReturnType<ReturnType<typeof createGcamMapperRegistry>["listArticleMappings"]>[number],
  scopeByFolder: ReadonlyMap<string, ReviewerScopeDeclaration>,
): CanonicalOwnerCandidate | null {
  for (const domain of articleMapping.domains) {
    const reviewerScope = scopeByFolder.get(normalizeKey(domain));
    if (!reviewerScope) continue;

    const pack = registry.load(reviewerScope.packId);
    const mappedAtoms = pack?.article_mapping.find((mapping) => mapping.article_id === articleMapping.articleId)?.atom_ids ?? [];
    return buildCanonicalOwnerCandidate(reviewerScope, articleMapping.articleId, mappedAtoms, 1000);
  }

  return null;
}

function resolveCanonicalOwnerFromPackMappings(
  pack: ReviewerKnowledgePack,
  articleId: number,
): CanonicalOwnerCandidate | null {
  const mapping = pack.article_mapping.find((entry) => entry.article_id === articleId) ?? null;
  if (!mapping) return null;

  const priority = computePackMappingPriority(mapping.role, mapping.note ?? "");
  const reviewerScope = getReviewerScopeDeclaration(pack.module_id);
  const reviewerFolder = reviewerScope?.folder ?? normalizeKey(pack.module_id.replace(/^v[0-9]+_[0-9]+_/, ""));
  return Object.freeze({
    owner: Object.freeze({
      reviewerId: reviewerScope?.reviewerId ?? pack.module_id,
      reviewerLabel: reviewerScope?.label ?? pack.title,
      reviewerPackId: reviewerScope?.packId ?? pack.id,
      reviewerFolder,
      articleId,
      atomIds: Object.freeze([...new Set(mapping.atom_ids.map((atomId) => atomId.trim()).filter((atomId) => atomId.length > 0))].sort((left, right) => left.localeCompare(right))),
    }),
    priority,
  });
}

export function buildCanonicalArticleOwnershipMap(registry: ReviewerKnowledgeRegistry): ReviewerCanonicalArticleOwnershipMap {
  const chosenByArticleId = new Map<string, Map<string, CanonicalOwnerCandidate>>();
  const scopeByFolder = buildReviewerScopeFolderMap();
  const articleIdsByFolder = buildReviewerArticleIdsByFolder(registry);

  for (const declaration of listReviewerScopeDeclarations()) {
    const articleIds = articleIdsByFolder[declaration.folder] ?? [];
    const pack = registry.load(declaration.packId);
    for (const articleId of articleIds) {
      const mappedAtoms = pack?.article_mapping.find((mapping) => mapping.article_id === articleId)?.atom_ids ?? [];
      const candidate = buildCanonicalOwnerCandidate(declaration, articleId, mappedAtoms, 1000);
      const articleKey = String(articleId);
      const bucket = chosenByArticleId.get(articleKey) ?? new Map<string, CanonicalOwnerCandidate>();
      const existing = bucket.get(candidate.owner.reviewerId);
      if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.owner.reviewerId.localeCompare(existing.owner.reviewerId) < 0)) {
        bucket.set(candidate.owner.reviewerId, candidate);
      }
      chosenByArticleId.set(articleKey, bucket);
    }
  }

  for (const pack of registry.list()) {
    for (const mapping of pack.article_mapping) {
      const candidate = resolveCanonicalOwnerFromPackMappings(pack, mapping.article_id);
      if (!candidate) continue;
      const articleKey = String(mapping.article_id);
      const bucket = chosenByArticleId.get(articleKey) ?? new Map<string, CanonicalOwnerCandidate>();
      const existing = bucket.get(candidate.owner.reviewerId);
      if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.owner.reviewerId.localeCompare(existing.owner.reviewerId) < 0)) {
        bucket.set(candidate.owner.reviewerId, candidate);
      }
      chosenByArticleId.set(articleKey, bucket);
    }
  }

  const result: Record<string, readonly ReviewerCanonicalArticleOwner[]> = {};
  for (const [articleId, candidates] of chosenByArticleId.entries()) {
    const ordered = [...candidates.values()].sort((left, right) => right.priority - left.priority || left.owner.reviewerId.localeCompare(right.owner.reviewerId));
    result[articleId] = Object.freeze(ordered.map((candidate) => candidate.owner));
  }
  return Object.freeze(result);
}

export function resolveCanonicalArticleOwners(registry: ReviewerKnowledgeRegistry, articleId: number): readonly ReviewerCanonicalArticleOwner[] {
  return buildCanonicalArticleOwnershipMap(registry)[String(articleId)] ?? Object.freeze([]);
}

export async function createReviewerKnowledgeRegistryFromDirectory(directoryPath: string, selectedFolders?: readonly string[]): Promise<ReviewerKnowledgeRegistry> {
  const loaded = await loadReviewerKnowledgeDocumentsFromDirectory(directoryPath);
  return new ReviewerKnowledgeRegistry(loaded.packs);
}

export { normalizeReviewerKnowledgePack };
