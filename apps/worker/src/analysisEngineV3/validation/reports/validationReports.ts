import { createHash } from "node:crypto";

import type {
  ValidationCoverageReport,
  ValidationKnowledgeGap,
  ValidationKnowledgeGapReport,
  ValidationReasoningReport,
  ValidationReasoningTraceSummary,
  ValidationReport,
  ValidationReportSummary,
  ValidationCaseResult,
  ValidationMetrics,
  ValidationStatistics,
} from "../types/validationTypes.js";
import { buildValidationMetrics } from "../metrics/validationMetrics.js";
import { buildValidationStatistics } from "../statistics/validationStatistics.js";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function buildReasoningReport(results: readonly ValidationCaseResult[]): ValidationReasoningReport {
  const traces: ValidationReasoningTraceSummary[] = results.map((result) =>
    Object.freeze({
      caseId: result.case.id,
      traceHash: result.reasoningTrace?.hash ?? null,
      stageCount: result.reasoningTrace?.stages.length ?? 0,
      articleIds: Object.freeze([...result.actualFinding.articleIds]),
      atomId: result.actualFinding.atomId,
    }),
  );
  const report: ValidationReasoningReport = Object.freeze({
    traces: Object.freeze(traces),
    traceCount: traces.length,
    hash: "",
  });
  return Object.freeze({
    ...report,
    hash: hash(report),
  });
}

function buildCoverageReport(metrics: ValidationMetrics, results: readonly ValidationCaseResult[]): ValidationCoverageReport {
  const missingCount = results.reduce((sum, result) => sum + Object.values(result.mismatches).filter(Boolean).length, 0);
  const coverage: ValidationCoverageReport = Object.freeze({
    conceptCoverage: metrics.conceptAccuracy,
    intentCoverage: metrics.intentAccuracy,
    contextCoverage: metrics.contextAccuracy,
    evidenceCoverage: metrics.evidenceAccuracy,
    judgmentCoverage: metrics.judgmentAccuracy,
    articleCoverage: metrics.articleAccuracy,
    atomCoverage: metrics.atomAccuracy,
    findingCoverage: metrics.findingAccuracy,
    explanationCoverage: metrics.explanationAccuracy,
    confidenceCoverage: metrics.confidenceAccuracy,
    overallCoverage: metrics.readinessScore,
    missingCount,
    hash: "",
  });
  return Object.freeze({
    ...coverage,
    hash: hash(coverage),
  });
}

function buildKnowledgeGaps(results: readonly ValidationCaseResult[]): ValidationKnowledgeGapReport {
  const gaps: ValidationKnowledgeGap[] = [];
  for (const result of results) {
    for (const difference of result.differences) {
      gaps.push(Object.freeze({
        caseId: result.case.id,
        field: difference.field,
        reason: difference.reason,
        missingKnowledge: difference.missingKnowledge,
        possibleDecisionRecord: difference.possibleDecisionRecord,
        possibleLesson: difference.possibleLesson,
        possiblePattern: difference.possiblePattern,
        possibleBenchmark: difference.possibleBenchmark,
      }));
    }
  }
  const report: ValidationKnowledgeGapReport = Object.freeze({
    gaps: Object.freeze(gaps),
    gapCount: gaps.length,
    missingKnowledgeCount: gaps.reduce((sum, gap) => sum + gap.missingKnowledge.length, 0),
    hash: "",
  });
  return Object.freeze({
    ...report,
    hash: hash(report),
  });
}

function buildSummary(metrics: ValidationMetrics, knowledgeGaps: ValidationKnowledgeGapReport): ValidationReportSummary {
  const productionReadiness = metrics.readinessScore >= 98 && metrics.falsePositives === 0 && metrics.falseNegatives === 0 && knowledgeGaps.gapCount === 0;
  const recommendation = productionReadiness ? "READY FOR RUNTIME" : "NOT READY FOR RUNTIME";
  const status = productionReadiness ? "LOCKED" : "NOT_READY";
  const summary: ValidationReportSummary = Object.freeze({
    readinessScore: metrics.readinessScore,
    productionReadiness,
    recommendation,
    status,
    hash: "",
  });
  return Object.freeze({
    ...summary,
    hash: hash(summary),
  });
}

export function createValidationReport(results: readonly ValidationCaseResult[]): ValidationReport {
  const metrics = buildValidationMetrics(results);
  const statistics = buildValidationStatistics(results);
  const reasoning = buildReasoningReport(results);
  const coverage = buildCoverageReport(metrics, results);
  const knowledgeGaps = buildKnowledgeGaps(results);
  const summary = buildSummary(metrics, knowledgeGaps);
  const report: ValidationReport = Object.freeze({
    summary,
    metrics,
    statistics,
    coverage,
    reasoning,
    knowledgeGaps,
    cases: Object.freeze([...results]),
    hash: "",
  });
  return Object.freeze({
    ...report,
    hash: hash(report),
  });
}

