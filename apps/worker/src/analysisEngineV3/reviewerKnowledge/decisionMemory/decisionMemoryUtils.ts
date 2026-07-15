import { createHash } from "node:crypto";

export function normalizeDecisionMemoryText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

export function uniqueDecisionMemoryStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeDecisionMemoryText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

export function uniqueDecisionMemoryNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

export function includesDecisionMemoryText(haystack: string, needle: string | null | undefined): boolean {
  const normalizedNeedle = normalizeDecisionMemoryText(needle).toLowerCase();
  return normalizedNeedle.length > 0 && normalizeDecisionMemoryText(haystack).toLowerCase().includes(normalizedNeedle);
}

export function stableSerializeDecisionMemoryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeDecisionMemoryValue(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableSerializeDecisionMemoryValue(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashDecisionMemoryValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeDecisionMemoryValue(value), "utf8").digest("hex");
}
