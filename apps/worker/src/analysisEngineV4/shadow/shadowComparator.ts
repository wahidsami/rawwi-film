import type { AnalysisResult } from "../../analysisEngine/types.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";

export type ShadowFindingComparison = Readonly<{
  key: string;
  visibleFinding: V3RuntimeFinding | null;
  shadowFinding: V3RuntimeFinding | null;
  matches: Readonly<{
    evidence: boolean;
    evidenceSpan: boolean;
    article: boolean;
    atom: boolean;
    explanation: boolean;
  }>;
}>;

export type ShadowBenchmarkSummary = Readonly<{
  findingPrecision: number;
  findingRecall: number;
  evidenceAccuracy: number;
  evidenceSpanAccuracy: number;
  articleAccuracy: number;
  explanationAccuracy: number;
  duplicateFindingRate: number;
  hallucinationRate: number;
  overallShadowScore: number;
}>;

export type ShadowComparisonReport = Readonly<{
  visibleEngine: string;
  shadowEngine: string;
  visibleFindingCount: number;
  shadowFindingCount: number;
  matchedFindingCount: number;
  visibleOnlyFindingCount: number;
  shadowOnlyFindingCount: number;
  duplicateFindingCount: number;
  hallucinationCount: number;
  comparisons: readonly ShadowFindingComparison[];
  benchmark: ShadowBenchmarkSummary;
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueBy<T>(values: readonly T[], keyFn: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return Object.freeze(unique);
}

function findingEvidenceKey(finding: V3RuntimeFinding): string {
  return [
    normalizeText(finding.evidence_snippet ?? ""),
    finding.start_offset_global ?? -1,
    finding.end_offset_global ?? -1,
  ].join("|");
}

function findingIdentityKey(finding: V3RuntimeFinding): string {
  return [
    finding.lineage_id ?? finding.canonical_finding_id ?? "",
    finding.article_id,
    finding.atom_id ?? finding.canonical_atom ?? "",
    normalizeText(finding.evidence_snippet ?? ""),
    finding.start_offset_global ?? -1,
    finding.end_offset_global ?? -1,
  ].join("|");
}

function pairScore(left: V3RuntimeFinding, right: V3RuntimeFinding): number {
  let score = 0;
  if (left.article_id === right.article_id) score += 4;
  if ((left.atom_id ?? null) === (right.atom_id ?? null)) score += 2;
  if ((left.canonical_atom ?? null) === (right.canonical_atom ?? null)) score += 1;
  if (normalizeText(left.evidence_snippet ?? "") === normalizeText(right.evidence_snippet ?? "")) score += 8;
  if ((left.start_offset_global ?? -1) === (right.start_offset_global ?? -1) && (left.end_offset_global ?? -1) === (right.end_offset_global ?? -1)) score += 8;
  if (normalizeText(left.title_ar ?? "") === normalizeText(right.title_ar ?? "")) score += 1;
  return score;
}

function normalizeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Number((numerator / denominator).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 1;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

export function compareShadowResults(input: Readonly<{
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
}>): ShadowComparisonReport {
  const visibleFindings = uniqueBy(
    [...input.visibleResult.findings].sort((left, right) => findingIdentityKey(left).localeCompare(findingIdentityKey(right))),
    findingIdentityKey,
  );
  const shadowFindings = uniqueBy(
    [...input.shadowResult.findings].sort((left, right) => findingIdentityKey(left).localeCompare(findingIdentityKey(right))),
    findingIdentityKey,
  );

  const shadowMatches = new Set<number>();
  const comparisons: ShadowFindingComparison[] = [];

  const sortedVisibleIndexes = [...visibleFindings.keys()].sort((left, right) => findingEvidenceKey(visibleFindings[left]!).localeCompare(findingEvidenceKey(visibleFindings[right]!)));
  const sortedShadowIndexes = [...shadowFindings.keys()].sort((left, right) => findingEvidenceKey(shadowFindings[left]!).localeCompare(findingEvidenceKey(shadowFindings[right]!)));

  for (const visibleIndex of sortedVisibleIndexes) {
    const visible = visibleFindings[visibleIndex]!;
    let bestShadowIndex: number | null = null;
    let bestScore = -1;
    for (const shadowIndex of sortedShadowIndexes) {
      if (shadowMatches.has(shadowIndex)) continue;
      const shadow = shadowFindings[shadowIndex]!;
      if (findingEvidenceKey(visible) !== findingEvidenceKey(shadow)) continue;
      const score = pairScore(visible, shadow);
      if (score > bestScore) {
        bestScore = score;
        bestShadowIndex = shadowIndex;
      }
    }

    if (bestShadowIndex !== null) {
      const shadow = shadowFindings[bestShadowIndex]!;
      shadowMatches.add(bestShadowIndex);
      comparisons.push(Object.freeze({
        key: findingEvidenceKey(visible),
        visibleFinding: visible,
        shadowFinding: shadow,
        matches: Object.freeze({
          evidence: normalizeText(visible.evidence_snippet ?? "") === normalizeText(shadow.evidence_snippet ?? ""),
          evidenceSpan: (visible.start_offset_global ?? -1) === (shadow.start_offset_global ?? -1)
            && (visible.end_offset_global ?? -1) === (shadow.end_offset_global ?? -1),
          article: visible.article_id === shadow.article_id,
          atom: (visible.atom_id ?? null) === (shadow.atom_id ?? null),
          explanation: normalizeText(visible.description_ar ?? "") === normalizeText(shadow.description_ar ?? ""),
        }),
      }));
      continue;
    }

    comparisons.push(Object.freeze({
      key: findingEvidenceKey(visible),
      visibleFinding: visible,
      shadowFinding: null,
      matches: Object.freeze({
        evidence: false,
        evidenceSpan: false,
        article: false,
        atom: false,
        explanation: false,
      }),
    }));
  }

  for (const shadowIndex of sortedShadowIndexes) {
    if (shadowMatches.has(shadowIndex)) continue;
    const shadow = shadowFindings[shadowIndex]!;
    comparisons.push(Object.freeze({
      key: findingEvidenceKey(shadow),
      visibleFinding: null,
      shadowFinding: shadow,
      matches: Object.freeze({
        evidence: false,
        evidenceSpan: false,
        article: false,
        atom: false,
        explanation: false,
      }),
    }));
  }

  const matchedComparisons = comparisons.filter((comparison) => comparison.visibleFinding && comparison.shadowFinding);
  const visibleOnlyCount = comparisons.filter((comparison) => comparison.visibleFinding !== null && comparison.shadowFinding === null).length;
  const shadowOnlyCount = comparisons.filter((comparison) => comparison.visibleFinding === null && comparison.shadowFinding !== null).length;
  const duplicateFindingCount = Math.max(0, shadowFindings.length - uniqueBy(shadowFindings, findingIdentityKey).length);
  const matchedCount = matchedComparisons.length;
  const evidenceMatches = matchedComparisons.filter((comparison) => comparison.matches.evidence).length;
  const evidenceSpanMatches = matchedComparisons.filter((comparison) => comparison.matches.evidenceSpan).length;
  const articleMatches = matchedComparisons.filter((comparison) => comparison.matches.article).length;
  const explanationMatches = matchedComparisons.filter((comparison) => comparison.matches.explanation).length;

  const benchmark: ShadowBenchmarkSummary = Object.freeze({
    findingPrecision: normalizeRate(matchedCount, shadowFindings.length),
    findingRecall: normalizeRate(matchedCount, visibleFindings.length),
    evidenceAccuracy: normalizeRate(evidenceMatches, matchedCount),
    evidenceSpanAccuracy: normalizeRate(evidenceSpanMatches, matchedCount),
    articleAccuracy: normalizeRate(articleMatches, matchedCount),
    explanationAccuracy: normalizeRate(explanationMatches, matchedCount),
    duplicateFindingRate: normalizeRate(duplicateFindingCount, shadowFindings.length),
    hallucinationRate: normalizeRate(shadowOnlyCount, shadowFindings.length),
    overallShadowScore: average([
      normalizeRate(matchedCount, shadowFindings.length),
      normalizeRate(matchedCount, visibleFindings.length),
      normalizeRate(evidenceMatches, matchedCount),
      normalizeRate(evidenceSpanMatches, matchedCount),
      normalizeRate(articleMatches, matchedCount),
      normalizeRate(explanationMatches, matchedCount),
      Number((1 - normalizeRate(duplicateFindingCount, shadowFindings.length)).toFixed(6)),
      Number((1 - normalizeRate(shadowOnlyCount, shadowFindings.length)).toFixed(6)),
    ]),
  });

  return Object.freeze({
    visibleEngine: input.visibleResult.diagnostics.engineVersion,
    shadowEngine: input.shadowResult.diagnostics.engineVersion,
    visibleFindingCount: visibleFindings.length,
    shadowFindingCount: shadowFindings.length,
    matchedFindingCount: matchedCount,
    visibleOnlyFindingCount: visibleOnlyCount,
    shadowOnlyFindingCount: shadowOnlyCount,
    duplicateFindingCount,
    hallucinationCount: shadowOnlyCount,
    comparisons: Object.freeze(comparisons),
    benchmark,
  });
}
