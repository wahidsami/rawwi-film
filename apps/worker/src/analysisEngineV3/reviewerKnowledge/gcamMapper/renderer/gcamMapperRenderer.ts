import { stableSerializeGcamMapperValue } from "../schemas/gcamMapperVersioning.js";
import type { GcamMapperCoverageReport, GcamMapperResult } from "../schemas/gcamMapperTypes.js";

export function renderGcamMapperCoverageReport(report: GcamMapperCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Version: ${report.version}`,
    `- Article Mappings: ${report.articleMappingCount}`,
    `- Atom Mappings: ${report.atomMappingCount}`,
    `- Mapping Rules: ${report.ruleCount}`,
    `- Mapped Concepts: ${report.mappedConceptCount}`,
    `- Unmapped Concepts: ${report.unmappedConceptCount}`,
    `- Mapping Debt: ${report.mappingDebtCount}`,
    `- Duplicate Mappings: ${report.duplicateMappingCount}`,
    `- Missing Mappings: ${report.missingMappingCount}`,
    `- Circular Mappings: ${report.circularMappingCount}`,
    `- Version Consistency: ${report.versionConsistency ? "YES" : "NO"}`,
    `- Coverage: ${report.coveragePercentage}%`,
    `- Production Readiness: ${report.productionReadiness ? "YES" : "NO"}`,
    `- Status: ${report.status}`,
  ];

  if (report.mappedConcepts.length > 0) {
    lines.push("", "## Mapped Concepts", ...report.mappedConcepts.map((entry) => `- ${entry}`));
  }
  if (report.unmappedConcepts.length > 0) {
    lines.push("", "## Unmapped Concepts", ...report.unmappedConcepts.map((entry) => `- ${entry}`));
  }
  if (report.mappingDebt.length > 0) {
    lines.push("", "## Mapping Debt", ...report.mappingDebt.map((entry) => `- ${entry.id}: ${entry.reason}`));
  }

  lines.push("", `Hash: ${report.hash}`);
  return lines.join("\n");
}

export function renderGcamMappingResult(result: GcamMapperResult): string {
  return stableSerializeGcamMapperValue({
    status: result.status,
    article: result.articleId === null ? "UNMAPPED" : {
      articleId: result.articleId,
      articleNumber: result.articleNumber,
      articleTitleAr: result.articleTitleAr,
    },
    atom: result.atomId === null ? null : {
      atomId: result.atomId,
      atomNumber: result.atomNumber,
      atomTitleAr: result.atomTitleAr,
    },
    findingTitle: result.findingTitle,
    findingCategory: result.findingCategory,
    reviewerExplanation: result.reviewerExplanation,
    supportingEvidence: result.supportingEvidence,
    matchedRuleId: result.matchedRuleId,
    mappingDebt: result.mappingDebt,
    confidence: result.confidence,
  });
}
