import { createHash } from "node:crypto";

import type { ValidationCaseResult, ValidationStatistics } from "../types/validationTypes.js";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}

export function buildValidationStatistics(results: readonly ValidationCaseResult[]): ValidationStatistics {
  const concepts = new Set<string>();
  const articles = new Set<number>();
  const atoms = new Set<string>();
  const intents = new Set<string>();
  let traceCount = 0;
  let totalEvidenceItems = 0;
  let totalReasoningStages = 0;

  for (const result of results) {
    result.actualConcepts.forEach((concept) => concepts.add(concept));
    result.actualArticleMapping.forEach((articleId) => articles.add(articleId));
    if (result.actualAtomId) atoms.add(result.actualAtomId);
    intents.add(result.actualIntent);
    traceCount += result.reasoningTrace ? 1 : 0;
    totalEvidenceItems += result.actualEvidence ? 1 : 0;
    totalReasoningStages += result.reasoningTrace?.stages.length ?? 0;
  }

  const statistics: ValidationStatistics = Object.freeze({
    totalCases: results.length,
    uniqueConceptCount: concepts.size,
    uniqueArticleCount: articles.size,
    uniqueAtomCount: atoms.size,
    uniqueIntentCount: intents.size,
    traceCount,
    totalEvidenceItems,
    totalReasoningStages,
    warningCount: results.reduce((sum, result) => sum + (result.passed ? 0 : 1), 0),
    errorCount: results.reduce((sum, result) => sum + Object.values(result.mismatches).filter(Boolean).length, 0),
    hash: "",
  });

  return Object.freeze({
    ...statistics,
    hash: createHash("sha256").update(stableSerialize(statistics), "utf8").digest("hex"),
  });
}

