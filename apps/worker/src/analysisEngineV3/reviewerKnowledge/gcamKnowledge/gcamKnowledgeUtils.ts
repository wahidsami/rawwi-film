import { createHash } from "node:crypto";

export function normalizeGcamKnowledgeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeGcamKnowledgeKey(value: string): string {
  return normalizeGcamKnowledgeText(value).toLowerCase();
}

export function stableSerializeGcamKnowledge(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeGcamKnowledge(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerializeGcamKnowledge(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashGcamKnowledgeValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeGcamKnowledge(value), "utf8").digest("hex");
}

