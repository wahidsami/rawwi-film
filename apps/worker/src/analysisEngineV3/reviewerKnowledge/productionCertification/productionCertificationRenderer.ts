import { renderHumanReviewerAlignmentReport } from "./humanReviewerAlignmentRenderer.js";
import type { ProductionCertificationMetric, ProductionCertificationReadinessReport, ProductionCertificationReport, ProductionCertificationScorecard } from "./productionCertificationTypes.js";

function renderMetric(metric: ProductionCertificationMetric): string {
  const unit = metric.unit === "percent" ? "%" : metric.unit === "ms" ? " ms" : "";
  return `- ${metric.label}: ${metric.value}${unit} [${metric.direction}]`;
}

function renderScorecard(scorecard: ProductionCertificationScorecard): string[] {
  const lines = [
    `- ${scorecard.title} (${scorecard.category})`,
    `  - Readiness: ${scorecard.readinessPercent}%`,
    `  - Ready: ${scorecard.ready ? "YES" : "NO"}`,
    `  - Source Hash: ${scorecard.sourceHash}`,
    `  - Hash: ${scorecard.hash}`,
  ];

  if (scorecard.metrics.length > 0) {
    lines.push("  - Metrics:");
    for (const metric of scorecard.metrics) {
      lines.push(`    ${renderMetric(metric)}`);
    }
  }

  if (scorecard.warnings.length > 0) {
    lines.push("  - Warnings:");
    for (const warning of scorecard.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  if (scorecard.gaps.length > 0) {
    lines.push("  - Gaps:");
    for (const gap of scorecard.gaps) {
      lines.push(`    - ${gap}`);
    }
  }

  return lines;
}

function renderReadinessReport(report: ProductionCertificationReadinessReport): string[] {
  const lines = [
    `- ${report.title}`,
    `  - Ready: ${report.ready ? "YES" : "NO"}`,
    `  - Readiness: ${report.readinessPercent}%`,
    `  - Basis: ${report.basis}`,
  ];

  if (report.warnings.length > 0) {
    lines.push("  - Warnings:");
    for (const warning of report.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  if (report.gaps.length > 0) {
    lines.push("  - Gaps:");
    for (const gap of report.gaps) {
      lines.push(`    - ${gap}`);
    }
  }

  return lines;
}

export function renderProductionCertificationReport(report: ProductionCertificationReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Generated At: ${report.generatedAt}`,
    `- Production Readiness: ${report.productionReadiness}%`,
    `- Ready For Production: ${report.readyForProduction ? "YES" : "NO"}`,
  ];

  if (report.metrics.length > 0) {
    lines.push("", "## Summary Metrics");
    for (const metric of report.metrics) {
      lines.push(renderMetric(metric));
    }
  }

  if (report.reviewerScorecards.length > 0) {
    lines.push("", "## Reviewer Scorecards");
    for (const scorecard of report.reviewerScorecards) {
      lines.push(...renderScorecard(scorecard));
    }
  }

  if (report.moduleScorecards.length > 0) {
    lines.push("", "## Module Scorecards");
    for (const scorecard of report.moduleScorecards) {
      lines.push(...renderScorecard(scorecard));
    }
  }

  if (report.knowledgeScorecards.length > 0) {
    lines.push("", "## Knowledge Scorecards");
    for (const scorecard of report.knowledgeScorecards) {
      lines.push(...renderScorecard(scorecard));
    }
  }

  if (report.readinessReports.length > 0) {
    lines.push("", "## Readiness Reports");
    for (const readinessReport of report.readinessReports) {
      lines.push(...renderReadinessReport(readinessReport));
    }
  }

  if (report.coverageReports.humanReviewerAlignment) {
    lines.push("", renderHumanReviewerAlignmentReport(report.coverageReports.humanReviewerAlignment));
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}
