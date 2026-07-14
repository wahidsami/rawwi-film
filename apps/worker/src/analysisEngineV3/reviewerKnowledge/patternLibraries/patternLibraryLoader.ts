import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadPatternLibraryDocumentsFromDirectory } from "./patternLibraryValidator.js";
import type { PatternLibraryDocument } from "./patternLibraryTypes.js";

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function discoverLibraryFolders(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  return Object.freeze(
    readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(rootDir, entry.name))
      .sort((left, right) => left.localeCompare(right)),
  );
}

export function loadPatternLibraryDocuments(rootDir: string): readonly PatternLibraryDocument[] {
  const documents: PatternLibraryDocument[] = [];
  if (isDirectory(rootDir)) {
    documents.push(...loadPatternLibraryDocumentsFromDirectory(rootDir));
  }
  for (const folder of discoverLibraryFolders(rootDir)) {
    documents.push(...loadPatternLibraryDocumentsFromDirectory(folder));
  }
  return Object.freeze(documents.sort((left, right) => left.metadata.id.localeCompare(right.metadata.id)));
}
