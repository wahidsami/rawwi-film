import { buildCompactText, normalizeArabicPunctuation, normalizeComparisonText, normalizeWhitespace } from "../evidence/evidenceNormalizer.js";

export function normalizeConceptText(value: string): string {
  return normalizeComparisonText(value);
}

export function normalizeConceptCategory(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function buildConceptKey(conceptId: string, evidenceId: string): string {
  return `${normalizeConceptCategory(conceptId)}|${normalizeWhitespace(evidenceId)}`;
}

export function buildConceptSummary(value: string): string {
  const normalized = normalizeArabicPunctuation(value);
  const compact = buildCompactText(normalized);
  return `${normalized} :: ${compact.compact}`;
}

export function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => normalizeWhitespace(value)).filter((value) => value.length > 0))]
      .sort((left, right) => left.localeCompare(right)),
  );
}

