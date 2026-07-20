import type { BenchmarkMetrics, BenchmarkStageFailure, BenchmarkStageName, BenchmarkStageScore } from "./benchmarkTypes.js";

function ratio(passed: number, total: number): number {
  if (total <= 0) return 1;
  return Number((passed / total).toFixed(6));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 1;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function scoreFromFailures(total: number, failures: readonly BenchmarkStageFailure[]): BenchmarkStageScore {
  const passed = Math.max(0, total - failures.length);
  return Object.freeze({
    stage: failures[0]?.stage ?? "judge",
    score: ratio(passed, total),
    passed,
    total,
  });
}

export function createStageScore(stage: BenchmarkStageName, passed: number, total: number): BenchmarkStageScore {
  return Object.freeze({
    stage,
    score: ratio(passed, total),
    passed,
    total,
  });
}

export function createBenchmarkMetrics(input: Readonly<{
  totalActualFindings: number;
  totalExpectedFindings: number;
  matchedFindings: number;
  evidenceMatches: number;
  evidenceSpanMatches: number;
  conceptMatches: number;
  gcamArticleMatches: number;
  explanationMatches: number;
  duplicateFindingCount: number;
  hallucinationCount: number;
}>): BenchmarkMetrics {
  const findingPrecision = ratio(input.matchedFindings, input.totalActualFindings);
  const findingRecall = ratio(input.matchedFindings, input.totalExpectedFindings);
  const evidenceAccuracy = ratio(input.evidenceMatches, input.matchedFindings);
  const evidenceSpanAccuracy = ratio(input.evidenceSpanMatches, input.matchedFindings);
  const conceptAccuracy = ratio(input.conceptMatches, input.matchedFindings);
  const gcamArticleAccuracy = ratio(input.gcamArticleMatches, input.matchedFindings);
  const explanationAccuracy = ratio(input.explanationMatches, input.matchedFindings);
  const duplicateFindingRate = ratio(input.duplicateFindingCount, input.totalActualFindings);
  const hallucinationRate = ratio(input.hallucinationCount, input.totalActualFindings);
  const overallReviewScore = average([
    findingPrecision,
    findingRecall,
    evidenceAccuracy,
    evidenceSpanAccuracy,
    conceptAccuracy,
    gcamArticleAccuracy,
    explanationAccuracy,
    Number((1 - duplicateFindingRate).toFixed(6)),
    Number((1 - hallucinationRate).toFixed(6)),
  ]);

  return Object.freeze({
    findingPrecision,
    findingRecall,
    evidenceAccuracy,
    evidenceSpanAccuracy,
    conceptAccuracy,
    gcamArticleAccuracy,
    explanationAccuracy,
    duplicateFindingRate,
    hallucinationRate,
    overallReviewScore,
  });
}

export function mergeStageScores(scores: readonly BenchmarkStageScore[]): BenchmarkStageScore {
  const stage = scores[0]?.stage ?? "judge";
  const total = scores.reduce((sum, value) => sum + value.total, 0);
  const passed = scores.reduce((sum, value) => sum + value.passed, 0);
  return createStageScore(stage, passed, total);
}
