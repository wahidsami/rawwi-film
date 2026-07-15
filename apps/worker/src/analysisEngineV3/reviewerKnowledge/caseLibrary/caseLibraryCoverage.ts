import { hashStableCaseLibraryValue } from "./caseLibraryUtils.js";
import type { CaseLibraryCoverageReport, CaseLibraryRegistry } from "./caseLibraryTypes.js";

export function createCaseLibraryCoverageReport(registry: CaseLibraryRegistry): CaseLibraryCoverageReport {
  const caseCount = registry.entries.reduce((sum, entry) => sum + entry.cases.length, 0);
  const positiveExampleCount = registry.entries.reduce((sum, entry) => sum + entry.positiveExamples.length, 0);
  const negativeExampleCount = registry.entries.reduce((sum, entry) => sum + entry.negativeExamples.length, 0);
  const borderlineExampleCount = registry.entries.reduce((sum, entry) => sum + entry.borderlineExamples.length, 0);
  const falsePositiveCount = registry.entries.reduce((sum, entry) => sum + entry.falsePositives.length, 0);
  const falseNegativeCount = registry.entries.reduce((sum, entry) => sum + entry.falseNegatives.length, 0);
  const similarCaseCount = registry.entries.reduce((sum, entry) => sum + entry.similarCases.length, 0);
  const counterExampleCount = registry.entries.reduce((sum, entry) => sum + entry.counterExamples.length, 0);
  const missingCoverage = registry.validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.path}`);
  const warnings = registry.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}:${issue.message}`);
  const articleCoveragePercent = registry.entries.length > 0 ? 100 : 0;
  const caseCoveragePercent = caseCount > 0 ? 100 : 0;

  const report: Omit<CaseLibraryCoverageReport, "hash"> = {
    framework: "GCAM Reviewer Case Library",
    articleCount: registry.entries.length,
    caseCount,
    positiveExampleCount,
    negativeExampleCount,
    borderlineExampleCount,
    falsePositiveCount,
    falseNegativeCount,
    similarCaseCount,
    counterExampleCount,
    articleCoveragePercent,
    caseCoveragePercent,
    readyForLibrary: registry.validation.valid && caseCount > 0,
    missingCoverage,
    warnings,
  };

  return Object.freeze({
    ...report,
    hash: hashStableCaseLibraryValue(report),
  });
}

export function renderCaseLibraryCoverageReport(report: CaseLibraryCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Articles: ${report.articleCount}`,
    `- Cases: ${report.caseCount}`,
    `- Positive Examples: ${report.positiveExampleCount}`,
    `- Negative Examples: ${report.negativeExampleCount}`,
    `- Borderline Examples: ${report.borderlineExampleCount}`,
    `- False Positives: ${report.falsePositiveCount}`,
    `- False Negatives: ${report.falseNegativeCount}`,
    `- Similar Cases: ${report.similarCaseCount}`,
    `- Counter Examples: ${report.counterExampleCount}`,
    `- Article Coverage: ${report.articleCoveragePercent}%`,
    `- Case Coverage: ${report.caseCoveragePercent}%`,
    `- Ready For Library: ${report.readyForLibrary ? "YES" : "NO"}`,
  ];

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", ...report.warnings.map((warning) => `- ${warning}`));
  }

  if (report.missingCoverage.length > 0) {
    lines.push("", "## Missing Coverage", ...report.missingCoverage.map((entry) => `- ${entry}`));
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}

