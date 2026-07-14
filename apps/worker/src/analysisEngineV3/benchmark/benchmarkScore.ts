import type { BenchmarkCaseResult, BenchmarkScore } from "./benchmarkTypes.js";

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function buildBenchmarkScore(results: readonly BenchmarkCaseResult[]): BenchmarkScore {
  const totalCases = results.length;
  const passedCases = results.filter((result) => result.passed).length;
  const truePositives = results.filter((result) => result.case.expectedFinding.disposition !== "reject" && result.actualFinding.disposition === "match").length;
  const falsePositives = results.filter((result) => result.case.expectedFinding.disposition === "reject" && result.actualFinding.disposition === "match").length;
  const falseNegatives = results.filter((result) => result.case.expectedFinding.disposition !== "reject" && result.actualFinding.disposition !== "match").length;
  const explanationMismatches = results.filter((result) => result.mismatches.explanation).length;
  const articleMappingMismatches = results.filter((result) => result.mismatches.articleMapping).length;
  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);

  return Object.freeze({
    totalCases,
    passedCases,
    passRate: totalCases === 0 ? 0 : round(passedCases / totalCases),
    precision: round(precision),
    recall: round(recall),
    falsePositives,
    falseNegatives,
    explanationMismatches,
    articleMappingMismatches,
  });
}
