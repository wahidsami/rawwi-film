import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

const REVIEWER_DISAGREEMENT_TYPES = new Set(["reviewer_disagreement"]);

export function createReviewerDisagreementsRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(entries.filter((entry) => REVIEWER_DISAGREEMENT_TYPES.has(entry.knowledgeType)));
}

