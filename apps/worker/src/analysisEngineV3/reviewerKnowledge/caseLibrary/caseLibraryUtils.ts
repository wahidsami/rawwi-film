import { createHash } from "node:crypto";

export function normalizeCaseLibraryText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

export function uniqueCaseLibraryStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeCaseLibraryText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

export function uniqueCaseLibraryNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

export function includesCaseLibraryText(haystack: string, needle: string | null | undefined): boolean {
  const normalizedNeedle = normalizeCaseLibraryText(needle);
  return normalizedNeedle.length > 0 && normalizeCaseLibraryText(haystack).toLowerCase().includes(normalizedNeedle.toLowerCase());
}

export function stableSerializeCaseLibraryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeCaseLibraryValue(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableSerializeCaseLibraryValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashStableCaseLibraryValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeCaseLibraryValue(value), "utf8").digest("hex");
}
