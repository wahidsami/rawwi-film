import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseGcamKnowledgeDocumentText, createEmptyGcamKnowledgeCatalog } from "../schemas/gcamKnowledgeSchema.js";
import type {
  GcamKnowledgeArticleRecord,
  GcamKnowledgeAtomRecord,
  GcamKnowledgeCatalog,
  GcamKnowledgeDocument,
  GcamKnowledgeRecord,
  GcamKnowledgeDebtRecord,
} from "../schemas/gcamKnowledgeTypes.js";
import { validateGcamKnowledgeCatalog } from "../validators/gcamKnowledgeValidator.js";

const CATEGORY_FOLDERS = Object.freeze([
  "articles",
  "atoms",
  "reviewerExamples",
  "reviewerComments",
  "reviewerObservations",
  "reviewerInterpretations",
  "reviewerExceptions",
  "reviewerCorrections",
  "reviewerDisagreements",
  "reviewerNotes",
  "knowledgeDebt",
]);

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isReadableDocumentFile(fileName: string): boolean {
  return /\.(?:json|ya?ml)$/i.test(fileName);
}

function loadDocumentFile(filePath: string): GcamKnowledgeDocument | null {
  const parsed = parseGcamKnowledgeDocumentText(readFileSync(filePath, "utf8")) as GcamKnowledgeDocument;
  if (!parsed || parsed.schema_version !== 1) {
    return null;
  }
  return parsed;
}

function appendRecord(catalog: GcamKnowledgeCatalog, record: GcamKnowledgeRecord): GcamKnowledgeCatalog {
  switch (record.kind) {
    case "article":
      return Object.freeze({ ...catalog, articles: Object.freeze([...catalog.articles, record as GcamKnowledgeArticleRecord]) });
    case "atom":
      return Object.freeze({ ...catalog, atoms: Object.freeze([...catalog.atoms, record as GcamKnowledgeAtomRecord]) });
    case "reviewer_example":
      return Object.freeze({ ...catalog, reviewerExamples: Object.freeze([...catalog.reviewerExamples, record]) });
    case "reviewer_comment":
      return Object.freeze({ ...catalog, reviewerComments: Object.freeze([...catalog.reviewerComments, record]) });
    case "reviewer_observation":
      return Object.freeze({ ...catalog, reviewerObservations: Object.freeze([...catalog.reviewerObservations, record]) });
    case "reviewer_interpretation":
      return Object.freeze({ ...catalog, reviewerInterpretations: Object.freeze([...catalog.reviewerInterpretations, record]) });
    case "reviewer_exception":
      return Object.freeze({ ...catalog, reviewerExceptions: Object.freeze([...catalog.reviewerExceptions, record]) });
    case "reviewer_correction":
      return Object.freeze({ ...catalog, reviewerCorrections: Object.freeze([...catalog.reviewerCorrections, record]) });
    case "reviewer_disagreement":
      return Object.freeze({ ...catalog, reviewerDisagreements: Object.freeze([...catalog.reviewerDisagreements, record]) });
    case "reviewer_note":
      return Object.freeze({ ...catalog, reviewerNotes: Object.freeze([...catalog.reviewerNotes, record]) });
    case "knowledge_debt":
      return Object.freeze({ ...catalog, knowledgeDebt: Object.freeze([...catalog.knowledgeDebt, record as GcamKnowledgeDebtRecord]) });
    default:
      return catalog;
  }
}

function mergeCatalogs(left: GcamKnowledgeCatalog, right: GcamKnowledgeCatalog): GcamKnowledgeCatalog {
  return Object.freeze({
    articles: Object.freeze([...left.articles, ...right.articles]),
    atoms: Object.freeze([...left.atoms, ...right.atoms]),
    reviewerExamples: Object.freeze([...left.reviewerExamples, ...right.reviewerExamples]),
    reviewerComments: Object.freeze([...left.reviewerComments, ...right.reviewerComments]),
    reviewerObservations: Object.freeze([...left.reviewerObservations, ...right.reviewerObservations]),
    reviewerInterpretations: Object.freeze([...left.reviewerInterpretations, ...right.reviewerInterpretations]),
    reviewerExceptions: Object.freeze([...left.reviewerExceptions, ...right.reviewerExceptions]),
    reviewerCorrections: Object.freeze([...left.reviewerCorrections, ...right.reviewerCorrections]),
    reviewerDisagreements: Object.freeze([...left.reviewerDisagreements, ...right.reviewerDisagreements]),
    reviewerNotes: Object.freeze([...left.reviewerNotes, ...right.reviewerNotes]),
    knowledgeDebt: Object.freeze([...left.knowledgeDebt, ...right.knowledgeDebt]),
  });
}

function collectFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) {
    return Object.freeze([]);
  }

  const files: string[] = [];
  for (const folder of CATEGORY_FOLDERS) {
    const folderPath = join(rootDir, folder);
    if (!isDirectory(folderPath)) continue;
    for (const entry of readdirSync(folderPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !isReadableDocumentFile(entry.name)) continue;
      files.push(join(folderPath, entry.name));
    }
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export function importGcamKnowledgeDocument(document: GcamKnowledgeDocument): GcamKnowledgeCatalog {
  if (document.format === "gcam_knowledge_record" && document.record) {
    return appendRecord(createEmptyGcamKnowledgeCatalog(), document.record);
  }

  if (document.format === "gcam_knowledge_catalog" && document.catalog) {
    return document.catalog;
  }

  if (document.format === "gcam_knowledge_bundle" && Array.isArray(document.records)) {
    let catalog = createEmptyGcamKnowledgeCatalog();
    for (const record of document.records) {
      catalog = appendRecord(catalog, record);
    }
    return catalog;
  }

  return createEmptyGcamKnowledgeCatalog();
}

export function loadGcamKnowledgeCatalogFromDirectory(rootDir: string): GcamKnowledgeCatalog {
  let catalog = createEmptyGcamKnowledgeCatalog();
  for (const filePath of collectFiles(rootDir)) {
    const document = loadDocumentFile(filePath);
    if (!document) continue;
    catalog = mergeCatalogs(catalog, importGcamKnowledgeDocument(document));
  }
  return catalog;
}

export function loadGcamKnowledgeCatalogFromDocuments(documents: readonly GcamKnowledgeDocument[]): GcamKnowledgeCatalog {
  let catalog = createEmptyGcamKnowledgeCatalog();
  for (const document of documents) {
    catalog = mergeCatalogs(catalog, importGcamKnowledgeDocument(document));
  }
  return catalog;
}

export function validateLoadedGcamKnowledgeCatalog(catalog: GcamKnowledgeCatalog) {
  return validateGcamKnowledgeCatalog(catalog);
}
