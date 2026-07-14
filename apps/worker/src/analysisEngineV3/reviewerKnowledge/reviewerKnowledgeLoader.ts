import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { ReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";

export class ReviewerKnowledgeLoader {
  constructor(private readonly registry: ReviewerKnowledgeRegistry) {}

  load(packId: string): ReviewerKnowledgePack | null {
    return this.registry.load(packId);
  }

  loadRequired(packId: string): ReviewerKnowledgePack {
    const pack = this.load(packId);
    if (!pack) {
      throw new Error(`Reviewer knowledge pack not found: ${packId}`);
    }
    return pack;
  }
}

export function createReviewerKnowledgeLoader(registry: ReviewerKnowledgeRegistry): ReviewerKnowledgeLoader {
  return new ReviewerKnowledgeLoader(registry);
}

