import { createKnowledgeAssetRegistry } from "../knowledgeAssets/knowledgeAssetRegistry.js";
import type { KnowledgeAcquisitionRecord, KnowledgeAcquisitionRegistry } from "../schema/knowledgeAcquisitionTypes.js";

export function createKnowledgeEvolutionRegistry(entries: readonly KnowledgeAcquisitionRecord[] = []): KnowledgeAcquisitionRegistry {
  return createKnowledgeAssetRegistry(
    entries.filter((entry) => Boolean(entry.supersedesId) || Boolean(entry.supersededById) || entry.agreementState !== "pending"),
  );
}

