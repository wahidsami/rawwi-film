import { hashKnowledgeRegistryValue, normalizeKnowledgeRegistryId, normalizeKnowledgeRegistryText, stableSerializeKnowledgeRegistryValue } from "../knowledgeRegistry/knowledgeRegistryUtils.js";

export function normalizeKnowledgeRankingText(value: string): string {
  return normalizeKnowledgeRegistryText(value).toLowerCase();
}

export function buildKnowledgeRankingCorpus(values: readonly unknown[]): string {
  return normalizeKnowledgeRankingText(values.map((value) => stableSerializeKnowledgeRegistryValue(value)).join(" \n "));
}

export function collectTextValues(value: unknown, values: Set<string>): void {
  if (typeof value === "string") {
    const normalized = normalizeKnowledgeRankingText(value);
    if (normalized.length > 0) {
      values.add(normalized);
    }
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    values.add(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextValues(item, values);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectTextValues(nested, values);
    }
  }
}

export function collectTextValuesAsArray(value: unknown): readonly string[] {
  const values = new Set<string>();
  collectTextValues(value, values);
  return Object.freeze([...values].sort((left, right) => left.localeCompare(right)));
}

export function collectNumberValues(value: unknown, values: Set<number>, articleContext = false): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (articleContext) {
      values.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNumberValues(item, values, articleContext);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      collectNumberValues(nested, values, articleContext || /article/i.test(key));
    }
  }
}

export function extractArticleIds(value: unknown): readonly number[] {
  const values = new Set<number>();
  collectNumberValues(value, values);
  return Object.freeze([...values].sort((left, right) => left - right));
}

export function scoreTerms(corpus: string, terms: readonly string[], weightPerHit: number, maxScore: number): { score: number; matchedTerms: readonly string[] } {
  const matchedTerms: string[] = [];
  let score = 0;
  for (const term of terms) {
    const normalized = normalizeKnowledgeRankingText(term);
    if (normalized.length === 0) continue;
    if (!corpus.includes(normalized)) continue;
    if (!matchedTerms.includes(normalized)) {
      matchedTerms.push(normalized);
    }
    score += weightPerHit;
    if (score >= maxScore) break;
  }

  return {
    score: Number(Math.min(score, maxScore).toFixed(4)),
    matchedTerms: Object.freeze(matchedTerms.sort((left, right) => left.localeCompare(right))),
  };
}

export function scoreOverlap(left: readonly number[], right: readonly number[], weightPerHit: number, maxScore: number): { score: number; matched: readonly number[] } {
  const matched = left.filter((value) => right.includes(value));
  return {
    score: Number(Math.min(matched.length * weightPerHit, maxScore).toFixed(4)),
    matched: Object.freeze([...new Set(matched)].sort((a, b) => a - b)),
  };
}

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeKnowledgeRankingText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function uniqueNumbers(values: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right));
}

export function registryIdentity(kind: string, id: string): string {
  return `${normalizeKnowledgeRegistryId(kind)}:${normalizeKnowledgeRegistryId(id)}`;
}

export function clampScore(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(4));
}

export function hashKnowledgeRankingValue(value: unknown): string {
  return hashKnowledgeRegistryValue(value);
}
