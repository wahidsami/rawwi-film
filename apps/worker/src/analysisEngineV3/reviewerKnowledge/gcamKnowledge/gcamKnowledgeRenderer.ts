import type { GcamCoverageReport } from "./gcamKnowledgeTypes.js";

export function renderGcamCoverageReport(report: GcamCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Articles: ${report.articleCount}`,
    `- Atoms: ${report.atomCount}`,
    `- Reviewer Examples: ${report.reviewerExampleCount}`,
    `- Reviewer Comments: ${report.reviewerCommentCount}`,
    `- Reviewer Observations: ${report.reviewerObservationCount}`,
    `- Reviewer Interpretations: ${report.reviewerInterpretationCount}`,
    `- Reviewer Exceptions: ${report.reviewerExceptionCount}`,
    `- Reviewer Corrections: ${report.reviewerCorrectionCount}`,
    `- Reviewer Disagreements: ${report.reviewerDisagreementCount}`,
    `- Reviewer Notes: ${report.reviewerNoteCount}`,
    `- Knowledge Debt: ${report.knowledgeDebtCount}`,
    `- Article Coverage: ${report.articleCoveragePercent}%`,
    `- Atom Coverage: ${report.atomCoveragePercent}%`,
    `- Example Coverage: ${report.exampleCoveragePercent}%`,
    `- Reviewer Notes Coverage: ${report.reviewerNotesCoveragePercent}%`,
    `- Observation Coverage: ${report.observationCoveragePercent}%`,
    `- Exception Coverage: ${report.exceptionCoveragePercent}%`,
    `- Ready For Benchmark: ${report.readyForBenchmark ? "YES" : "NO"}`,
  ];

  if (report.missingCoverage.length > 0) {
    lines.push("", "## Missing Coverage", ...report.missingCoverage.map((entry) => `- ${entry}`));
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}

