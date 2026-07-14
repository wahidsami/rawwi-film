import { createHash } from "node:crypto";

import { loadPatternLibraryDocuments } from "./patternLibraryLoader.js";
import { renderPatternLibraryDocument } from "./patternLibraryRenderer.js";
import { validatePatternLibraryDocument } from "./patternLibraryValidator.js";
import type { PatternLibraryDocument, PatternLibraryEntry, PatternLibraryRegistry } from "./patternLibraryTypes.js";

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createPatternLibraryRegistry(rootDir: string): PatternLibraryRegistry {
  const documents = loadPatternLibraryDocuments(rootDir);
  const validationResults = documents.map((document) => validatePatternLibraryDocument(document));
  const validation = Object.freeze({
    valid: validationResults.every((result) => result.valid),
    issues: Object.freeze(validationResults.flatMap((result) => result.issues)),
    hash: hashText(JSON.stringify(validationResults.map((result) => result.hash).sort((left, right) => left.localeCompare(right)))),
  });

  const entries = documents.flatMap((document) => document.entries);
  const documentMap = new Map(documents.map((document) => [document.metadata.id, document] as const));
  const entryMap = new Map(entries.map((entry) => [entry.id, entry] as const));
  const hash = hashText(JSON.stringify(documents.map((document) => renderPatternLibraryDocument(document)).sort((left, right) => left.localeCompare(right))));

  return Object.freeze({
    rootDir,
    documents,
    validation,
    hash,
    listDocuments: () => documents,
    listEntries: () => entries,
    getDocument: (id: string) => documentMap.get(id) ?? null,
    getEntry: (id: string) => entryMap.get(id) ?? null,
  });
}
