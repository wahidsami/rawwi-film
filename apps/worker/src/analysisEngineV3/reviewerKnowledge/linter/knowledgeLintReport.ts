import { createHash } from "node:crypto";
import type { KnowledgeLintPack, KnowledgeLintReport } from "./knowledgeLintTypes.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalizeKnowledgeLintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeKnowledgeLintValue(entry));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalizeKnowledgeLintValue(value[key]);
    }
    return result;
  }
  return value;
}

export function stableSerializeKnowledgeLintValue(value: unknown): string {
  return JSON.stringify(canonicalizeKnowledgeLintValue(value), null, 2);
}

export function hashKnowledgeLintValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeKnowledgeLintValue(value), "utf8").digest("hex");
}

export function createKnowledgeLintReport(pack: KnowledgeLintPack, payload: Omit<KnowledgeLintReport, "stableHash">): KnowledgeLintReport {
  const stableHash = hashKnowledgeLintValue({
    metadata: payload.metadata,
    sourcePath: payload.sourcePath,
    errors: payload.errors,
    warnings: payload.warnings,
    statistics: payload.statistics,
    coverage: payload.coverage,
    packScore: payload.packScore,
    overallScore: payload.overallScore,
  });

  return Object.freeze({
    ...payload,
    stableHash,
  });
}

export function serializeKnowledgeLintReport(report: KnowledgeLintReport): string {
  return stableSerializeKnowledgeLintValue(report);
}

