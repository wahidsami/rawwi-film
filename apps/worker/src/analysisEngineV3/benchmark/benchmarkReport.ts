import type { BenchmarkCaseResult, BenchmarkReport, BenchmarkScore } from "./benchmarkTypes.js";

export function createBenchmarkReport(cases: readonly BenchmarkCaseResult[], score: BenchmarkScore): BenchmarkReport {
  return Object.freeze({
    cases: Object.freeze([...cases]),
    score,
  });
}

