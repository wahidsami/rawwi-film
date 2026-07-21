import type { BenchmarkReport } from "./benchmarkTypes.js";

export function createBenchmarkReport(report: BenchmarkReport): BenchmarkReport {
  return Object.freeze({
    ...report,
    cases: Object.freeze([...report.cases]),
    engineComparisons: Object.freeze({
      ...report.engineComparisons,
      v3: Object.freeze([...(report.engineComparisons.v3 ?? [])]),
      v4: Object.freeze([...(report.engineComparisons.v4 ?? [])]),
    }),
    engineExecution: Object.freeze({
      ...report.engineExecution,
    }),
    engineMetrics: Object.freeze({
      ...report.engineMetrics,
    }),
    falsePositives: Object.freeze([...report.falsePositives]),
    falseNegatives: Object.freeze([...report.falseNegatives]),
    incorrectEvidence: Object.freeze([...report.incorrectEvidence]),
    incorrectArticleMappings: Object.freeze([...report.incorrectArticleMappings]),
    hallucinatedExplanations: Object.freeze([...report.hallucinatedExplanations]),
  });
}
