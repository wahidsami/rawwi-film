import { createHash } from "node:crypto";

import { hashKnowledgeAcquisitionValue } from "../schema/knowledgeAcquisitionSchema.js";
import { normalizeKnowledgeAcquisitionText } from "../schema/knowledgeAcquisitionVersioning.js";
import { validateKnowledgeAcquisitionRecords } from "../schema/knowledgeAcquisitionValidator.js";
import type {
  KnowledgeAcquisitionCoverageReport,
  KnowledgeAcquisitionRecord,
} from "../schema/knowledgeAcquisitionTypes.js";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeKnowledgeAcquisitionText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function createKnowledgeAcquisitionCoverageReport(records: readonly KnowledgeAcquisitionRecord[]): KnowledgeAcquisitionCoverageReport {
  const validation = validateKnowledgeAcquisitionRecords(records);
  const domains = unique(records.map((record) => record.domain));
  const knowledgeTypes = unique(records.map((record) => record.knowledgeType));
  const sources = unique(records.map((record) => record.source));
  const concepts = unique(records.flatMap((record) => record.concepts));
  const duplicateIdCount = records.length - new Set(records.map((record) => normalizeKnowledgeAcquisitionText(record.id))).size;
  const brokenReferenceCount = validation.issues.filter((issue) => issue.code.includes(".invalid")).length;
  const missingReferenceCount = validation.issues.filter((issue) => issue.code.includes(".missing")).length;
  const evolutionLinkCount = records.filter((record) => Boolean(record.supersedesId) || Boolean(record.supersededById)).length;

  const penalties = Math.min(100, (validation.issues.filter((issue) => issue.severity === "error").length * 5) + validation.issues.filter((issue) => issue.severity === "warning").length + duplicateIdCount * 10);
  const coveragePercent = Math.max(0, 100 - penalties);
  const warnings = unique(validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}:${issue.message}`));
  const gaps = unique([
    ...validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.message}`),
  ]);

  const report: Omit<KnowledgeAcquisitionCoverageReport, "hash"> = {
    framework: "GCAM Knowledge Acquisition Framework",
    recordCount: records.length,
    domainCount: domains.length,
    knowledgeTypeCount: knowledgeTypes.length,
    sourceCount: sources.length,
    conceptCount: concepts.length,
    duplicateIdCount,
    brokenReferenceCount,
    missingReferenceCount,
    evolutionLinkCount,
    coveragePercent,
    productionReadiness: coveragePercent,
    readyForAcademy: validation.valid && coveragePercent >= 98,
    warnings,
    gaps,
  };

  return Object.freeze({
    ...report,
    hash: hashKnowledgeAcquisitionValue(report),
  });
}

export function renderKnowledgeAcquisitionCoverageReport(report: KnowledgeAcquisitionCoverageReport): string {
  const lines = [
    `# ${report.framework}`,
    `- Records: ${report.recordCount}`,
    `- Domains: ${report.domainCount}`,
    `- Knowledge Types: ${report.knowledgeTypeCount}`,
    `- Sources: ${report.sourceCount}`,
    `- Concepts: ${report.conceptCount}`,
    `- Duplicate IDs: ${report.duplicateIdCount}`,
    `- Broken References: ${report.brokenReferenceCount}`,
    `- Missing References: ${report.missingReferenceCount}`,
    `- Evolution Links: ${report.evolutionLinkCount}`,
    `- Coverage: ${report.coveragePercent}%`,
    `- Production Readiness: ${report.productionReadiness}%`,
    `- Ready For Academy: ${report.readyForAcademy ? "YES" : "NO"}`,
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

