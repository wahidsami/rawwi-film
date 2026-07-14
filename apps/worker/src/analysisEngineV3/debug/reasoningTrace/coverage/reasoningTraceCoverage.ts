import { createHash } from "node:crypto";

import {
  type ReasoningTraceComparatorReport,
  type ReasoningTraceCoverageReport,
} from "../types/reasoningTraceTypes.js";
import { stableSerializeReasoningTraceValue } from "../collector/reasoningTraceComparatorCollector.js";

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
}

export function buildReasoningTraceCoverageReport(
  report: ReasoningTraceComparatorReport,
): ReasoningTraceCoverageReport {
  const missingStages = report.stages.filter((stage) => stage.status === "missing").map((stage) => stage.stage);
  const unexpectedStages = report.stages.filter((stage) => stage.status === "unexpected").map((stage) => stage.stage);
  const confidenceAlignmentPercent = report.stages.length === 0
    ? 100
    : Number((report.stages.filter((stage) => stage.confidenceDifference === 0).length / report.stages.length * 100).toFixed(6));

  const expectedKnowledge = uniqueCount(
    report.stages.flatMap((stage) => stage.expected?.knowledgeAssetsUsed ?? []),
  );
  const matchedKnowledge = uniqueCount(
    report.stages.flatMap((stage) => {
      if (!stage.expected || !stage.actual) return [];
      return stage.expected.knowledgeAssetsUsed.filter((value) => stage.actual?.knowledgeAssetsUsed.includes(value));
    }),
  );

  const knowledgeCoveragePercent = expectedKnowledge === 0
    ? 100
    : Number(((matchedKnowledge / expectedKnowledge) * 100).toFixed(6));
  const warnings = [
    ...(missingStages.length > 0 ? [`Missing stages: ${missingStages.join(", ")}`] : []),
    ...(unexpectedStages.length > 0 ? [`Unexpected stages: ${unexpectedStages.join(", ")}`] : []),
    ...(report.partialStageCount > 0 ? [`Partial stages: ${report.partialStageCount}`] : []),
  ];
  const coveragePercent = report.coveragePercent;
  const readyForProduction = report.readyForProduction && coveragePercent >= 98;
  const coverage: ReasoningTraceCoverageReport = Object.freeze({
    hash: "",
    coveragePercent,
    knowledgeCoveragePercent,
    confidenceAlignmentPercent,
    expectedStageCount: report.expectedStageCount,
    actualStageCount: report.actualStageCount,
    matchedStageCount: report.matchedStageCount,
    missingStageCount: report.missingStageCount,
    unexpectedStageCount: report.unexpectedStageCount,
    partialStageCount: report.partialStageCount,
    missingStages: Object.freeze(missingStages),
    unexpectedStages: Object.freeze(unexpectedStages),
    warnings: Object.freeze(warnings),
    readyForProduction,
  });

  return Object.freeze({
    ...coverage,
    hash: createHash("sha256").update(stableSerializeReasoningTraceValue(coverage), "utf8").digest("hex"),
  });
}

export function renderReasoningTraceCoverageReport(report: ReasoningTraceCoverageReport): string {
  return [
    "## Reasoning Trace Coverage Report",
    "",
    `- Coverage: ${report.coveragePercent.toFixed(2)}%`,
    `- Knowledge Coverage: ${report.knowledgeCoveragePercent.toFixed(2)}%`,
    `- Confidence Alignment: ${report.confidenceAlignmentPercent.toFixed(2)}%`,
    `- Expected Stages: ${report.expectedStageCount}`,
    `- Actual Stages: ${report.actualStageCount}`,
    `- Matched Stages: ${report.matchedStageCount}`,
    `- Missing Stages: ${report.missingStageCount}`,
    `- Unexpected Stages: ${report.unexpectedStageCount}`,
    `- Partial Stages: ${report.partialStageCount}`,
    `- Ready For Production: ${report.readyForProduction ? "YES" : "NO"}`,
    "",
    "### Missing Stage IDs",
    report.missingStages.length === 0 ? "- None" : report.missingStages.map((stage) => `- ${stage}`).join("\n"),
    "",
    "### Unexpected Stage IDs",
    report.unexpectedStages.length === 0 ? "- None" : report.unexpectedStages.map((stage) => `- ${stage}`).join("\n"),
    "",
    "### Warnings",
    report.warnings.length === 0 ? "- None" : report.warnings.map((warning) => `- ${warning}`).join("\n"),
    "",
    `- Hash: ${report.hash}`,
  ].join("\n");
}
