import { loadPatternLibraryDocuments } from "./patternLibraryLoader.js";
import type { PatternLibraryDocument } from "./patternLibraryTypes.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function renderPatternLibraryDocument(document: PatternLibraryDocument): string {
  return JSON.stringify(canonicalize(document), null, 2);
}

export function renderPatternLibraries(rootDir: string): string {
  return JSON.stringify(canonicalize(loadPatternLibraryDocuments(rootDir)), null, 2);
}
