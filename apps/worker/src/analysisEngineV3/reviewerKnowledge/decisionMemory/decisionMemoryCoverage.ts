import { hashDecisionMemoryValue } from "./decisionMemoryUtils.js";
import type { DecisionMemoryCoverageReport, DecisionMemoryRegistry } from "./decisionMemoryTypes.js";

export function createDecisionMemoryCoverageReport(registry: DecisionMemoryRegistry): DecisionMemoryCoverageReport {
  const acceptedCount = registry.entries.filter((entry) => entry.status === "accepted").length;
  const rejectedCount = registry.entries.filter((entry) => entry.status === "rejected").length;
  const needsReviewCount = registry.entries.filter((entry) => entry.status === "needs_review").length;
  const missingCoverage = registry.validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.path}`);
  const warnings = registry.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}:${issue.message}`);

  const report: Omit<DecisionMemoryCoverageReport, "hash"> = {
    framework: "GCAM Reviewer Decision Memory",
    decisionCount: registry.entries.length,
    acceptedCount,
    rejectedCount,
    needsReviewCount,
    articleCoveragePercent: registry.entries.length > 0 ? 100 : 0,
    decisionCoveragePercent: registry.validation.valid && registry.entries.length > 0 ? 100 : 0,
    readyForMemory: registry.validation.valid && registry.entries.length > 0,
    missingCoverage,
    warnings,
  };

  return Object.freeze({
    ...report,
    hash: hashDecisionMemoryValue(report),
  });
}

export function renderDecisionMemoryCoverageReport(report: DecisionMemoryCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Decisions: ${report.decisionCount}`,
    `- Accepted: ${report.acceptedCount}`,
    `- Rejected: ${report.rejectedCount}`,
    `- Needs Review: ${report.needsReviewCount}`,
    `- Article Coverage: ${report.articleCoveragePercent}%`,
    `- Decision Coverage: ${report.decisionCoveragePercent}%`,
    `- Ready For Memory: ${report.readyForMemory ? "YES" : "NO"}`,
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

