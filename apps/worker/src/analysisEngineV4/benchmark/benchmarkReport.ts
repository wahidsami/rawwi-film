import type { BenchmarkReport } from "./benchmarkTypes.js";

export function createBenchmarkReport(report: BenchmarkReport): BenchmarkReport {
  return Object.freeze({
    ...report,
    cases: Object.freeze([...report.cases]),
    falsePositives: Object.freeze([...report.falsePositives]),
    falseNegatives: Object.freeze([...report.falseNegatives]),
    incorrectEvidence: Object.freeze([...report.incorrectEvidence]),
    incorrectArticleMappings: Object.freeze([...report.incorrectArticleMappings]),
    hallucinatedExplanations: Object.freeze([...report.hallucinatedExplanations]),
  });
}

