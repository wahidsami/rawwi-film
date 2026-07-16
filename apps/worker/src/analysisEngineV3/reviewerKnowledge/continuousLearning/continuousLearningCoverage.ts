import { hashContinuousLearningValue } from "./continuousLearningUtils.js";
import type { ContinuousLearningCoverageReport, ContinuousLearningRecord, ContinuousLearningRegistry } from "./continuousLearningTypes.js";
import { validateContinuousLearningRecords } from "./continuousLearningRegistry.js";

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) => left.localeCompare(right)));
}

function hashValue(value: unknown): string {
  return hashContinuousLearningValue(value);
}

function isContinuousLearningRegistry(value: readonly ContinuousLearningRecord[] | ContinuousLearningRegistry): value is ContinuousLearningRegistry {
  return !Array.isArray(value);
}

export function createContinuousLearningCoverageReport(records: readonly ContinuousLearningRecord[] | ContinuousLearningRegistry): ContinuousLearningCoverageReport {
  const normalizedRecords = isContinuousLearningRegistry(records) ? records.list() : records;
  const validation = validateContinuousLearningRecords(normalizedRecords);

  const signalKinds = unique(normalizedRecords.map((record) => record.signalKind));
  const versions = unique(normalizedRecords.map((record) => record.version));
  const domains = unique(normalizedRecords.map((record) => record.domain));
  const concepts = unique(normalizedRecords.flatMap((record) => record.concepts));
  const lessonCount = normalizedRecords.reduce((count, record) => count + record.artifacts.lessons.length, 0);
  const caseCount = normalizedRecords.reduce((count, record) => count + record.artifacts.cases.length, 0);
  const patternCount = normalizedRecords.reduce((count, record) => count + record.artifacts.patterns.length, 0);
  const knowledgeUpdateCount = normalizedRecords.reduce((count, record) => count + record.artifacts.knowledgeUpdates.length, 0);
  const decisionMemoryCount = normalizedRecords.reduce((count, record) => count + record.artifacts.decisionMemories.length, 0);
  const reviewerImprovementCount = normalizedRecords.reduce((count, record) => count + record.artifacts.reviewerImprovements.length, 0);
  const duplicateIdCount = normalizedRecords.length - new Set(normalizedRecords.map((record) => record.id)).size;

  const presentCategories = [
    lessonCount > 0,
    caseCount > 0,
    patternCount > 0,
    knowledgeUpdateCount > 0,
    decisionMemoryCount > 0,
    reviewerImprovementCount > 0,
  ].filter(Boolean).length;

  const warnings = unique([
    ...validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}:${issue.message}`),
    ...(presentCategories < 6 ? ["missing learning artifact category coverage"] : []),
  ]);
  const gaps = unique([
    ...validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.message}`),
    ...(lessonCount === 0 ? ["missing lessons"] : []),
    ...(caseCount === 0 ? ["missing cases"] : []),
    ...(patternCount === 0 ? ["missing patterns"] : []),
    ...(knowledgeUpdateCount === 0 ? ["missing knowledge updates"] : []),
    ...(decisionMemoryCount === 0 ? ["missing decision memories"] : []),
    ...(reviewerImprovementCount === 0 ? ["missing reviewer improvements"] : []),
  ]);

  const coveragePercent = Math.max(0, Math.min(100, Math.round((presentCategories / 6) * 100) - (duplicateIdCount * 10)));
  const report: Omit<ContinuousLearningCoverageReport, "hash"> = {
    framework: "GCAM Continuous Learning Framework",
    recordCount: normalizedRecords.length,
    signalKindCount: signalKinds.length,
    versionCount: versions.length,
    domainCount: domains.length,
    conceptCount: concepts.length,
    lessonCount,
    caseCount,
    patternCount,
    knowledgeUpdateCount,
    decisionMemoryCount,
    reviewerImprovementCount,
    duplicateIdCount,
    coveragePercent,
    productionReadiness: coveragePercent,
    readyForLearning: validation.valid && normalizedRecords.length > 0 && gaps.length === 0,
    warnings,
    gaps,
  };

  return Object.freeze({
    ...report,
    hash: hashValue(report),
  });
}

export function renderContinuousLearningCoverageReport(report: ContinuousLearningCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Records: ${report.recordCount}`,
    `- Signal Types: ${report.signalKindCount}`,
    `- Versions: ${report.versionCount}`,
    `- Domains: ${report.domainCount}`,
    `- Concepts: ${report.conceptCount}`,
    `- Lessons: ${report.lessonCount}`,
    `- Cases: ${report.caseCount}`,
    `- Patterns: ${report.patternCount}`,
    `- Knowledge Updates: ${report.knowledgeUpdateCount}`,
    `- Decision Memories: ${report.decisionMemoryCount}`,
    `- Reviewer Improvements: ${report.reviewerImprovementCount}`,
    `- Duplicate IDs: ${report.duplicateIdCount}`,
    `- Coverage: ${report.coveragePercent}%`,
    `- Production Readiness: ${report.productionReadiness}%`,
    `- Ready For Learning: ${report.readyForLearning ? "YES" : "NO"}`,
  ];

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", ...report.warnings.map((warning) => `- ${warning}`));
  }

  if (report.gaps.length > 0) {
    lines.push("", "## Gaps", ...report.gaps.map((gap) => `- ${gap}`));
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}
