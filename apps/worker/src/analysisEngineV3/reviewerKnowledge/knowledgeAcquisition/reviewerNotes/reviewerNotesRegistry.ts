import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

const REVIEWER_NOTE_TYPES = new Set([
  "reviewer_comment",
  "reviewer_explanation",
  "reviewer_rationale",
  "reviewer_interpretation",
  "reviewer_dialect_note",
  "reviewer_cultural_note",
  "reviewer_historical_note",
  "reviewer_religious_note",
  "reviewer_political_note",
  "reviewer_visual_note",
  "reviewer_storytelling_note",
  "reviewer_hidden_meaning_note",
  "reviewer_symbolism_note",
]);

export function createReviewerNotesRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(entries.filter((entry) => REVIEWER_NOTE_TYPES.has(entry.knowledgeType)));
}

