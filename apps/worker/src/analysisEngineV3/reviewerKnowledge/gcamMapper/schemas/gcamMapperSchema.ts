import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  GcamMapperArticleMapping,
  GcamMapperAtomMapping,
  GcamMapperCatalog,
  GcamMapperRule,
} from "./gcamMapperTypes.js";
import { canonicalizeGcamMapperValue, freezeGcamMapperValue, normalizeGcamMapperText, stableSerializeGcamMapperValue } from "./gcamMapperVersioning.js";

export type GcamMapperDocument<TEntry> = Readonly<{
  schema_version: 1;
  version: string;
  id: string;
  title: string;
  description: string;
  entries: readonly TEntry[];
}>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadJsonDocument(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function loadDocument<TEntry>(filePath: string): GcamMapperDocument<TEntry> {
  const parsed = loadJsonDocument(filePath);
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid GCAM mapper document: ${filePath}`);
  }

  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return freezeGcamMapperValue({
    schema_version: 1 as const,
    version: normalizeGcamMapperText(String(parsed.version ?? "")),
    id: normalizeGcamMapperText(String(parsed.id ?? "")),
    title: normalizeGcamMapperText(String(parsed.title ?? "")),
    description: normalizeGcamMapperText(String(parsed.description ?? "")),
    entries: entries.map((entry) => entry as TEntry),
  });
}

export function loadGcamMapperArticleDocument(filePath: string): GcamMapperDocument<GcamMapperArticleMapping> {
  return loadDocument<GcamMapperArticleMapping>(filePath);
}

export function loadGcamMapperAtomDocument(filePath: string): GcamMapperDocument<GcamMapperAtomMapping> {
  return loadDocument<GcamMapperAtomMapping>(filePath);
}

export function loadGcamMapperRuleDocument(filePath: string): GcamMapperDocument<GcamMapperRule> {
  return loadDocument<GcamMapperRule>(filePath);
}

export function hashGcamMapperDocument(document: GcamMapperDocument<unknown>): string {
  return createHash("sha256").update(stableSerializeGcamMapperValue(document), "utf8").digest("hex");
}

export function serializeGcamMapperCatalog(catalog: GcamMapperCatalog): string {
  return stableSerializeGcamMapperValue(catalog);
}

export function canonicalizeGcamMapperCatalog(catalog: GcamMapperCatalog): GcamMapperCatalog {
  return freezeGcamMapperValue({
    version: normalizeGcamMapperText(catalog.version),
    articleMappings: [...catalog.articleMappings].sort((left, right) => left.id.localeCompare(right.id)),
    atomMappings: [...catalog.atomMappings].sort((left, right) => left.id.localeCompare(right.id)),
    mappingRules: [...catalog.mappingRules].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function normalizeGcamMapperConcepts(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeGcamMapperText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function extractGcamMapperConcepts(catalog: GcamMapperCatalog): readonly string[] {
  return normalizeGcamMapperConcepts([
    ...catalog.mappingRules.flatMap((rule) => rule.match.concepts),
    ...catalog.articleMappings.flatMap((entry) => entry.concepts),
    ...catalog.atomMappings.flatMap((entry) => entry.concepts),
  ]);
}

export function toCatalogHash(catalog: GcamMapperCatalog): string {
  return createHash("sha256").update(stableSerializeGcamMapperValue(canonicalizeGcamMapperValue(catalog)), "utf8").digest("hex");
}
