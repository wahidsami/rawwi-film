import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

const REVIEWER_EXAMPLE_TYPES = new Set([
  "reviewer_finding",
  "reviewer_exception",
  "reviewer_edge_case",
  "reviewer_consensus",
]);

export function createReviewerExamplesRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(entries.filter((entry) => REVIEWER_EXAMPLE_TYPES.has(entry.knowledgeType)));
}

