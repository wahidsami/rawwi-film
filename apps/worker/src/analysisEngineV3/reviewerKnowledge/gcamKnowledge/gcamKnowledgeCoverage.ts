import { hashGcamKnowledgeValue } from "./gcamKnowledgeUtils.js";
import type { GcamCoverageReport, GcamKnowledgeCatalog, GcamKnowledgeValidationIssue } from "./gcamKnowledgeTypes.js";
import { createGcamKnowledgeCoverageReport } from "./gcamKnowledgeSource.js";

export function computeGcamKnowledgeCoverageReport(catalog: GcamKnowledgeCatalog, validationIssues: readonly GcamKnowledgeValidationIssue[] = []): GcamCoverageReport {
  return createGcamKnowledgeCoverageReport(catalog, validationIssues);
}

export function hashGcamKnowledgeCoverageReport(report: GcamCoverageReport): string {
  return hashGcamKnowledgeValue(report);
}

