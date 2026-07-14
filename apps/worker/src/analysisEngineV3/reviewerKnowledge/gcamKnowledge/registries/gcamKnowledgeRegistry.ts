import { hashGcamKnowledgeValue, normalizeGcamKnowledgeKey } from "../schemas/gcamKnowledgeSchema.js";
import type {
  GcamKnowledgeCatalog,
  GcamKnowledgeDocument,
  GcamKnowledgeKind,
  GcamKnowledgeRecord,
  GcamKnowledgeRegistry,
} from "../schemas/gcamKnowledgeTypes.js";
import { createEmptyGcamKnowledgeCatalog } from "../schemas/gcamKnowledgeSchema.js";
import { loadGcamKnowledgeCatalogFromDirectory, importGcamKnowledgeDocument } from "../loaders/gcamKnowledgeLoader.js";
import { validateGcamKnowledgeCatalog } from "../validators/gcamKnowledgeValidator.js";

function collectAllRecords(catalog: GcamKnowledgeCatalog): readonly GcamKnowledgeRecord[] {
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

function removeRecordById(catalog: GcamKnowledgeCatalog, id: string): GcamKnowledgeCatalog {
  const normalizedId = normalizeGcamKnowledgeKey(id);
  return Object.freeze({
    articles: Object.freeze(catalog.articles.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    atoms: Object.freeze(catalog.atoms.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerExamples: Object.freeze(catalog.reviewerExamples.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerComments: Object.freeze(catalog.reviewerComments.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerObservations: Object.freeze(catalog.reviewerObservations.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerInterpretations: Object.freeze(catalog.reviewerInterpretations.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerExceptions: Object.freeze(catalog.reviewerExceptions.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerCorrections: Object.freeze(catalog.reviewerCorrections.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerDisagreements: Object.freeze(catalog.reviewerDisagreements.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    reviewerNotes: Object.freeze(catalog.reviewerNotes.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
    knowledgeDebt: Object.freeze(catalog.knowledgeDebt.filter((item) => normalizeGcamKnowledgeKey(item.id) !== normalizedId)),
  });
}

function appendRecord(catalog: GcamKnowledgeCatalog, record: GcamKnowledgeRecord): GcamKnowledgeCatalog {
  const withoutExisting = removeRecordById(catalog, record.id);
  const append = <T extends readonly GcamKnowledgeRecord[]>(items: T): T => Object.freeze([...items, record]) as T;

  return Object.freeze({
    articles: record.kind === "article" ? (append(withoutExisting.articles) as GcamKnowledgeCatalog["articles"]) : withoutExisting.articles,
    atoms: record.kind === "atom" ? (append(withoutExisting.atoms) as GcamKnowledgeCatalog["atoms"]) : withoutExisting.atoms,
    reviewerExamples: record.kind === "reviewer_example" ? (append(withoutExisting.reviewerExamples) as GcamKnowledgeCatalog["reviewerExamples"]) : withoutExisting.reviewerExamples,
    reviewerComments: record.kind === "reviewer_comment" ? (append(withoutExisting.reviewerComments) as GcamKnowledgeCatalog["reviewerComments"]) : withoutExisting.reviewerComments,
    reviewerObservations: record.kind === "reviewer_observation" ? (append(withoutExisting.reviewerObservations) as GcamKnowledgeCatalog["reviewerObservations"]) : withoutExisting.reviewerObservations,
    reviewerInterpretations: record.kind === "reviewer_interpretation" ? (append(withoutExisting.reviewerInterpretations) as GcamKnowledgeCatalog["reviewerInterpretations"]) : withoutExisting.reviewerInterpretations,
    reviewerExceptions: record.kind === "reviewer_exception" ? (append(withoutExisting.reviewerExceptions) as GcamKnowledgeCatalog["reviewerExceptions"]) : withoutExisting.reviewerExceptions,
    reviewerCorrections: record.kind === "reviewer_correction" ? (append(withoutExisting.reviewerCorrections) as GcamKnowledgeCatalog["reviewerCorrections"]) : withoutExisting.reviewerCorrections,
    reviewerDisagreements: record.kind === "reviewer_disagreement" ? (append(withoutExisting.reviewerDisagreements) as GcamKnowledgeCatalog["reviewerDisagreements"]) : withoutExisting.reviewerDisagreements,
    reviewerNotes: record.kind === "reviewer_note" ? (append(withoutExisting.reviewerNotes) as GcamKnowledgeCatalog["reviewerNotes"]) : withoutExisting.reviewerNotes,
    knowledgeDebt: record.kind === "knowledge_debt" ? (append(withoutExisting.knowledgeDebt) as GcamKnowledgeCatalog["knowledgeDebt"]) : withoutExisting.knowledgeDebt,
  });
}

export function createEmptyGcamKnowledgeRegistry(): GcamKnowledgeRegistry {
  return createGcamKnowledgeRegistry(createEmptyGcamKnowledgeCatalog());
}

export function createGcamKnowledgeRegistry(initialCatalog: GcamKnowledgeCatalog): GcamKnowledgeRegistry {
  let catalog = initialCatalog;
  let validation = validateGcamKnowledgeCatalog(catalog);
  let hash = hashGcamKnowledgeValue({ catalog, validation });

  const rebuild = (): void => {
    validation = validateGcamKnowledgeCatalog(catalog);
    hash = hashGcamKnowledgeValue({ catalog, validation });
  };

  const current: GcamKnowledgeRegistry = {
    get catalog() {
      return catalog;
    },
    get validation() {
      return validation;
    },
    get hash() {
      return hash;
    },
    listAll: () => collectAllRecords(catalog),
    listByKind: (kind: GcamKnowledgeKind) => Object.freeze(collectAllRecords(catalog).filter((record) => record.kind === kind)),
    get: (id: string) => collectAllRecords(catalog).find((record) => normalizeGcamKnowledgeKey(record.id) === normalizeGcamKnowledgeKey(id)) ?? null,
    register: (record: GcamKnowledgeRecord) => {
      catalog = appendRecord(catalog, record);
      rebuild();
      return current;
    },
    unregister: (id: string) => {
      catalog = removeRecordById(catalog, id);
      rebuild();
      return current;
    },
    importDocument: (document: GcamKnowledgeDocument) => {
      const imported = importGcamKnowledgeDocument(document);
      catalog = Object.freeze({
        articles: Object.freeze([...catalog.articles, ...imported.articles]),
        atoms: Object.freeze([...catalog.atoms, ...imported.atoms]),
        reviewerExamples: Object.freeze([...catalog.reviewerExamples, ...imported.reviewerExamples]),
        reviewerComments: Object.freeze([...catalog.reviewerComments, ...imported.reviewerComments]),
        reviewerObservations: Object.freeze([...catalog.reviewerObservations, ...imported.reviewerObservations]),
        reviewerInterpretations: Object.freeze([...catalog.reviewerInterpretations, ...imported.reviewerInterpretations]),
        reviewerExceptions: Object.freeze([...catalog.reviewerExceptions, ...imported.reviewerExceptions]),
        reviewerCorrections: Object.freeze([...catalog.reviewerCorrections, ...imported.reviewerCorrections]),
        reviewerDisagreements: Object.freeze([...catalog.reviewerDisagreements, ...imported.reviewerDisagreements]),
        reviewerNotes: Object.freeze([...catalog.reviewerNotes, ...imported.reviewerNotes]),
        knowledgeDebt: Object.freeze([...catalog.knowledgeDebt, ...imported.knowledgeDebt]),
      });
      rebuild();
      return current;
    },
    exportDocument: () => ({
      schema_version: 1,
      document_version: "1.0.0",
      format: "gcam_knowledge_catalog",
      catalog,
    }),
  };

  rebuild();
  return current;
}

export function loadGcamKnowledgeRegistryFromDirectory(rootDir: string): GcamKnowledgeRegistry {
  return createGcamKnowledgeRegistry(loadGcamKnowledgeCatalogFromDirectory(rootDir));
}
