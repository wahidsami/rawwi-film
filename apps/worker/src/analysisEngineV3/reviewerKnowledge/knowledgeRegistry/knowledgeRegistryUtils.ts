import { createHash } from "node:crypto";

export function normalizeKnowledgeRegistryText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeKnowledgeRegistryId(value: string): string {
  return normalizeKnowledgeRegistryText(value).toLowerCase();
}

export function uniqueSortedKnowledgeRegistryStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stableSerializeKnowledgeRegistryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeKnowledgeRegistryValue(entry)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = (value as Record<string, unknown>)[key];
    }
    return `{${Object.keys(canonical).map((key) => `${JSON.stringify(key)}:${stableSerializeKnowledgeRegistryValue(canonical[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashKnowledgeRegistryValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeKnowledgeRegistryValue(value), "utf8").digest("hex");
}

export function toStringList(values: readonly string[] | null | undefined): readonly string[] {
  return Object.freeze([...new Set((values ?? []).map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function toMaybeString(value: unknown): string | null {
  return typeof value === "string" ? normalizeKnowledgeRegistryText(value) : null;
}

export function toMaybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
