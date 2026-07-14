import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack, normalizeReviewerKnowledgePackId } from "./reviewerKnowledgeNormalization.js";
import { loadReviewerKnowledgeDocumentsFromDirectory } from "./reviewerKnowledgeIO.js";
import { loadReviewerAcademyPacks } from "./academy/reviewerAcademyLoader.js";

const READER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ACADEMY_DIRECTORY = join(READER_DIRECTORY, "academy");
const DEFAULT_PACKS: readonly ReviewerKnowledgePack[] = Object.freeze([]);

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

export function createDefaultReviewerKnowledgeRegistry(): ReviewerKnowledgeRegistry {
  return new ReviewerKnowledgeRegistry(loadReviewerAcademyPacks(ACADEMY_DIRECTORY));
}

export async function createReviewerKnowledgeRegistryFromDirectory(directoryPath: string): Promise<ReviewerKnowledgeRegistry> {
  const loaded = await loadReviewerKnowledgeDocumentsFromDirectory(directoryPath);
  return new ReviewerKnowledgeRegistry(loaded.packs);
}

export { normalizeReviewerKnowledgePack };
