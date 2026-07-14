import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

const REVIEWER_CORRECTION_TYPES = new Set(["reviewer_correction"]);

export function createReviewerCorrectionsRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(entries.filter((entry) => REVIEWER_CORRECTION_TYPES.has(entry.knowledgeType)));
}

