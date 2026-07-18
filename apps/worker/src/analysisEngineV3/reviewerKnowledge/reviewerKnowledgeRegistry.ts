import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack, normalizeReviewerKnowledgePackId } from "./reviewerKnowledgeNormalization.js";
import { loadReviewerKnowledgeDocumentsFromDirectory } from "./reviewerKnowledgeIO.js";
import { loadReviewerAcademyPacks } from "./academy/reviewerAcademyLoader.js";
import { createGcamMapperRegistry } from "./gcamMapper/registry/gcamMapperRegistry.js";
import { getReviewerScopeDeclaration, listReviewerScopeDeclarations, type ReviewerScopeDeclaration } from "./reviewerScopeMatrix.js";

const READER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ACADEMY_DIRECTORY = join(READER_DIRECTORY, "academy");
const DEFAULT_PACKS: readonly ReviewerKnowledgePack[] = Object.freeze([]);
let cachedDefaultReviewerKnowledgeRegistry: ReviewerKnowledgeRegistry | null = null;
let cachedDefaultGcamMapperRegistry: ReturnType<typeof createGcamMapperRegistry> | null = null;

export type ReviewerCanonicalArticleOwner = Readonly<{
  reviewerId: string;
  reviewerLabel: string;
  reviewerPackId: string;
  reviewerFolder: string;
  articleId: number;
  atomIds: readonly string[];
}>;

export type ReviewerCanonicalArticleOwnershipMap = Readonly<Record<string, readonly ReviewerCanonicalArticleOwner[]>>;

type CanonicalOwnerCandidate = Readonly<{
  owner: ReviewerCanonicalArticleOwner;
  priority: number;
}>;

export class ReviewerKnowledgeRegistry {
  private readonly packs = new Map<string, ReviewerKnowledgePack>();

  constructor(entries: readonly ReviewerKnowledgePack[] = DEFAULT_PACKS) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(pack: ReviewerKnowledgePack): this {
    const normalized = normalizeReviewerKnowledgePack(pack);
    this.packs.set(normalized.id, normalized);
    return this;
  }

  unregister(packId: string): boolean {
    return this.packs.delete(normalizeReviewerKnowledgePackId(packId));
  }

  load(packId: string): ReviewerKnowledgePack | null {
    return this.packs.get(normalizeReviewerKnowledgePackId(packId)) ?? null;
  }

  list(): readonly ReviewerKnowledgePack[] {
    return Object.freeze([...this.packs.values()].sort((left, right) => left.id.localeCompare(right.id)));
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
  const chosenByArticleId = new Map<string, CanonicalOwnerCandidate>();
  const scopeByFolder = buildReviewerScopeFolderMap();
  const gcamArticleMappings = getDefaultGcamMapperRegistry().listArticleMappings();

  for (const articleMapping of gcamArticleMappings) {
    const candidate = resolveCanonicalOwnerFromGcamMapping(registry, articleMapping, scopeByFolder);
    if (!candidate) continue;
    const articleKey = String(articleMapping.articleId);
    const existing = chosenByArticleId.get(articleKey);
    if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.owner.reviewerId.localeCompare(existing.owner.reviewerId) < 0)) {
      chosenByArticleId.set(articleKey, candidate);
    }
  }

  for (const pack of registry.list()) {
    for (const mapping of pack.article_mapping) {
      const candidate = resolveCanonicalOwnerFromPackMappings(pack, mapping.article_id);
      if (!candidate) continue;
      const articleKey = String(mapping.article_id);
      const existing = chosenByArticleId.get(articleKey);
      if (!existing || candidate.priority > existing.priority || (candidate.priority === existing.priority && candidate.owner.reviewerId.localeCompare(existing.owner.reviewerId) < 0)) {
        chosenByArticleId.set(articleKey, candidate);
      }
    }
  }

  const result: Record<string, readonly ReviewerCanonicalArticleOwner[]> = {};
  for (const [articleId, candidate] of chosenByArticleId.entries()) {
    result[articleId] = Object.freeze([candidate.owner]);
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
