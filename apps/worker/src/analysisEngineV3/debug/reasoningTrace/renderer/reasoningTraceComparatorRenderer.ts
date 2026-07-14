import type { ReasoningTraceComparatorReport } from "../types/reasoningTraceTypes.js";
import { buildReasoningTraceCoverageReport, renderReasoningTraceCoverageReport } from "../coverage/reasoningTraceCoverage.js";
import { buildReasoningTraceTimeline, renderReasoningTraceTimeline } from "../timeline/reasoningTraceTimeline.js";

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(" | ");
}

function renderStageRow(index: number, stage: ReasoningTraceComparatorReport["stages"][number]): string {
  return [
    index + 1,
    stage.title,
    stage.status,
    list(stage.matched),
    list(stage.missing),
    list(stage.unexpected),
    stage.confidenceDifference === null ? "n/a" : stage.confidenceDifference.toFixed(6),
    list(stage.reasonDifference),
    list(stage.knowledgeDifference),
  ].join(" | ");
}

export function renderReasoningTraceComparatorReport(report: ReasoningTraceComparatorReport): string {
  const coverage = buildReasoningTraceCoverageReport(report);
  const timeline = buildReasoningTraceTimeline(report.stages.flatMap((stage) => stage.actual ? [stage.actual] : stage.expected ? [stage.expected] : []));
  const lines = [
    "# Reasoning Trace Comparator Report",
    "",
    `- Hash: ${report.hash}`,
    `- Expected Stages: ${report.expectedStageCount}`,
    `- Actual Stages: ${report.actualStageCount}`,
    `- Matched Stages: ${report.matchedStageCount}`,
    `- Missing Stages: ${report.missingStageCount}`,
    `- Unexpected Stages: ${report.unexpectedStageCount}`,
    `- Partial Stages: ${report.partialStageCount}`,
    `- Coverage: ${report.coveragePercent.toFixed(2)}%`,
    `- Ready For Production: ${report.readyForProduction ? "YES" : "NO"}`,
    `- Confidence Difference: ${report.confidenceDifference.toFixed(6)}`,
    `- Reason Differences: ${report.reasonDifferenceCount}`,
    `- Knowledge Differences: ${report.knowledgeDifferenceCount}`,
    "",
    "## Stage Comparison",
    "",
    "| # | Stage | Status | Matched | Missing | Unexpected | Confidence Δ | Reason Difference | Knowledge Difference |",
    "|---|---|---|---|---|---:|---:|---|---|",
    ...report.stages.map((stage, index) => renderStageRow(index, stage)),
    "",
    renderReasoningTraceCoverageReport(coverage),
    "",
    renderReasoningTraceTimeline(timeline),
  ];
  return lines.join("\n");
}
