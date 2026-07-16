import type {
  HumanReviewerAlignmentReport,
  HumanReviewerAlignmentScorecard,
} from "./humanReviewerAlignmentTypes.js";
import type { ProductionCertificationMetric } from "./productionCertificationTypes.js";

function renderMetric(metric: ProductionCertificationMetric): string {
  const unit = metric.unit === "percent" ? "%" : metric.unit === "ms" ? " ms" : "";
  return `- ${metric.label}: ${metric.value}${unit} [${metric.direction}]`;
}

function renderScorecard(scorecard: HumanReviewerAlignmentScorecard): string[] {
  const lines = [
    `- ${scorecard.reviewerName} (${scorecard.domain})`,
    `  - Reviewer ID: ${scorecard.reviewerId}`,
    `  - Total Scripts: ${scorecard.totalScripts}`,
    `  - Precision: ${scorecard.precision}%`,
    `  - Recall: ${scorecard.recall}%`,
    `  - Article Selection Accuracy: ${scorecard.articleSelectionAccuracy}%`,
    `  - Confidence Alignment: ${scorecard.confidenceAlignment}%`,
    `  - Reasoning Alignment: ${scorecard.reasoningAlignment}%`,
    `  - Reviewer Drift: ${scorecard.reviewerDrift}%`,
    `  - Readiness: ${scorecard.readinessPercent}%`,
    `  - Source Hash: ${scorecard.sourceHash}`,
    `  - Hash: ${scorecard.hash}`,
  ];

  if (scorecard.knowledgeGaps.length > 0) {
    lines.push("  - Knowledge Gaps:");
    for (const gap of scorecard.knowledgeGaps) {
      lines.push(`    - ${gap}`);
    }
  }

  if (scorecard.articleWeaknesses.length > 0) {
    lines.push("  - Article Weaknesses:");
    for (const weakness of scorecard.articleWeaknesses) {
      lines.push(`    - ${weakness}`);
    }
  }

  if (scorecard.learningPriorities.length > 0) {
    lines.push("  - Learning Priorities:");
    for (const priority of scorecard.learningPriorities) {
      lines.push(`    - ${priority}`);
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

export function renderHumanReviewerAlignmentReport(report: HumanReviewerAlignmentReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Generated At: ${report.generatedAt}`,
    `- Records: ${report.recordCount}`,
    `- Reviewers: ${report.reviewerCount}`,
    `- Reviewed Scripts: ${report.reviewedScriptCount}`,
    `- Human Findings: ${report.humanFindingCount}`,
    `- Decision Records: ${report.decisionRecordCount}`,
    `- Reviewer Drift: ${report.reviewerDrift}%`,
    `- Readiness: ${report.readinessPercent}%`,
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

  if (report.knowledgeGaps.length > 0) {
    lines.push("", "## Knowledge Gaps");
    for (const gap of report.knowledgeGaps) {
      lines.push(`- ${gap}`);
    }
  }

  if (report.articleWeaknesses.length > 0) {
    lines.push("", "## Article Weaknesses");
    for (const weakness of report.articleWeaknesses) {
      lines.push(`- ${weakness}`);
    }
  }

  if (report.learningPriorities.length > 0) {
    lines.push("", "## Learning Priorities");
    for (const priority of report.learningPriorities) {
      lines.push(`- ${priority}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (report.gaps.length > 0) {
    lines.push("", "## Gaps");
    for (const gap of report.gaps) {
      lines.push(`- ${gap}`);
    }
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}
