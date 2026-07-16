import { createHash } from "node:crypto";

export function normalizeContinuousLearningText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeContinuousLearningId(value: string): string {
  return normalizeContinuousLearningText(value).toLowerCase();
}

export function uniqueSortedContinuousLearningStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeContinuousLearningText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = canonicalize(record[key]);
    }
    return canonical;
  }
  return value;
}

export function stableSerializeContinuousLearningValue(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function hashContinuousLearningValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeContinuousLearningValue(value), "utf8").digest("hex");
}

export function clampContinuousLearningConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}
