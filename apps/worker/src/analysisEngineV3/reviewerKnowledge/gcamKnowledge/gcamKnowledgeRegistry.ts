import { hashGcamKnowledgeValue, normalizeGcamKnowledgeKey } from "./gcamKnowledgeUtils.js";
import type { GcamKnowledgeCatalog, GcamKnowledgeKind, GcamKnowledgeRecord, GcamKnowledgeRegistry } from "./gcamKnowledgeTypes.js";
import { createGcamKnowledgeLoader } from "./gcamKnowledgeLoader.js";
import { validateGcamKnowledgeCatalog } from "./gcamKnowledgeValidator.js";

const DEFAULT_CATALOG_ROOT = null;
let cachedDefaultGcamKnowledgeRegistry: GcamKnowledgeRegistry | null = null;

function listAllRecords(catalog: GcamKnowledgeCatalog): readonly GcamKnowledgeRecord[] {
  return Object.freeze([
    ...catalog.articles,
    ...catalog.atoms,
    ...catalog.reviewerExamples,
    ...catalog.reviewerComments,
    ...catalog.reviewerObservations,
    ...catalog.reviewerInterpretations,
    ...catalog.reviewerExceptions,
    ...catalog.reviewerCorrections,
    ...catalog.reviewerDisagreements,
    ...catalog.reviewerNotes,
    ...catalog.knowledgeDebt,
  ].sort((left, right) => left.id.localeCompare(right.id)));
}

export function createGcamKnowledgeRegistry(catalog: GcamKnowledgeCatalog | null = null): GcamKnowledgeRegistry {
  if (catalog === DEFAULT_CATALOG_ROOT && cachedDefaultGcamKnowledgeRegistry) {
    return cachedDefaultGcamKnowledgeRegistry;
  }

  const resolvedCatalog = catalog ?? createGcamKnowledgeLoader().load();
  const validation = validateGcamKnowledgeCatalog(resolvedCatalog);
  const hash = hashGcamKnowledgeValue({
    catalog: resolvedCatalog,
    validation,
  });
  const allRecords = listAllRecords(resolvedCatalog);

  const registry = Object.freeze({
    catalog: resolvedCatalog,
    validation,
    hash,
    listAll: () => allRecords,
    listByKind: (kind: GcamKnowledgeKind) => Object.freeze(allRecords.filter((record) => record.kind === kind)),
    get: (id: string) => allRecords.find((record) => normalizeGcamKnowledgeKey(record.id) === normalizeGcamKnowledgeKey(id)) ?? null,
  });

  if (catalog === DEFAULT_CATALOG_ROOT) {
    cachedDefaultGcamKnowledgeRegistry = registry;
  }

  return registry;
}
