import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

const REVIEWER_OBSERVATION_TYPES = new Set([
  "reviewer_observation",
  "reviewer_visual_note",
  "reviewer_storytelling_note",
  "reviewer_hidden_meaning_note",
  "reviewer_symbolism_note",
]);

export function createReviewerObservationsRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(entries.filter((entry) => REVIEWER_OBSERVATION_TYPES.has(entry.knowledgeType)));
}

