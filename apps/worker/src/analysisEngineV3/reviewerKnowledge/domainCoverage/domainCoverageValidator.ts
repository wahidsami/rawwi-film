import { createHash } from "node:crypto";

import type { DomainCoverageIssue, DomainCoverageReport, DomainCoverageValidationResult } from "./domainCoverageTypes.js";

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

function pushIssue(issues: DomainCoverageIssue[], severity: DomainCoverageIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function validateSection(name: string, section: DomainCoverageReport[keyof Pick<DomainCoverageReport, "blueprint" | "knowledgePack" | "lessons" | "patterns" | "decisionRecords" | "benchmarks">], issues: DomainCoverageIssue[]): void {
  if (!Number.isFinite(section.coveragePercent) || section.coveragePercent < 0 || section.coveragePercent > 100) {
    pushIssue(issues, "error", `${name}.coverage`, name, `${section.title} coverage must be between 0 and 100.`);
  }

  if (section.present < 0 || section.expected < 0) {
    pushIssue(issues, "error", `${name}.count`, name, `${section.title} counts must be non-negative.`);
  }

  if (section.missing.join("|") !== sortedUnique(section.missing).join("|")) {
    pushIssue(issues, "error", `${name}.missing`, name, `${section.title} missing items must be sorted and unique.`);
  }
}

function stripHash(report: DomainCoverageReport): Omit<DomainCoverageReport, "hash"> {
  return {
    domainId: report.domainId,
    domainTitle: report.domainTitle,
    domainVersion: report.domainVersion,
    blueprint: report.blueprint,
    knowledgePack: report.knowledgePack,
    lessons: report.lessons,
    patterns: report.patterns,
    decisionRecords: report.decisionRecords,
    benchmarks: report.benchmarks,
    metrics: report.metrics,
    productionReadiness: report.productionReadiness,
    recommendation: report.recommendation,
    coverageGaps: report.coverageGaps,
    criticalGaps: report.criticalGaps,
    warnings: report.warnings,
  };
}

export function validateDomainCoverageReport(report: DomainCoverageReport): DomainCoverageValidationResult {
  const issues: DomainCoverageIssue[] = [];

  if (typeof report.domainId !== "string" || report.domainId.trim().length === 0) {
    pushIssue(issues, "error", "domainId", "domainId", "Domain id must be a non-empty string.");
  }
  if (typeof report.domainTitle !== "string" || report.domainTitle.trim().length === 0) {
    pushIssue(issues, "error", "domainTitle", "domainTitle", "Domain title must be a non-empty string.");
  }
  if (typeof report.domainVersion !== "string" || report.domainVersion.trim().length === 0) {
    pushIssue(issues, "error", "domainVersion", "domainVersion", "Domain version must be a non-empty string.");
  }

  validateSection("blueprint", report.blueprint, issues);
  validateSection("knowledgePack", report.knowledgePack, issues);
  validateSection("lessons", report.lessons, issues);
  validateSection("patterns", report.patterns, issues);
  validateSection("decisionRecords", report.decisionRecords, issues);
  validateSection("benchmarks", report.benchmarks, issues);

  if (!Number.isFinite(report.productionReadiness) || report.productionReadiness < 0 || report.productionReadiness > 100) {
    pushIssue(issues, "error", "productionReadiness", "productionReadiness", "Production readiness must be between 0 and 100.");
  }

  if (!["READY", "NOT READY"].includes(report.recommendation)) {
    pushIssue(issues, "error", "recommendation", "recommendation", "Recommendation must be READY or NOT READY.");
  }

  if (report.recommendation === "READY" && report.productionReadiness < 90) {
    pushIssue(issues, "error", "recommendation", "recommendation", "READY requires a production readiness of at least 90.");
  }

  if (report.recommendation === "NOT READY" && report.productionReadiness >= 90 && report.criticalGaps.length === 0) {
    pushIssue(issues, "warning", "recommendation", "recommendation", "A high scoring report without critical gaps usually should be READY.");
  }

  if (report.coverageGaps.join("|") !== sortedUnique(report.coverageGaps).join("|")) {
    pushIssue(issues, "error", "coverageGaps", "coverageGaps", "Coverage gaps must be sorted and unique.");
  }
  if (report.criticalGaps.join("|") !== sortedUnique(report.criticalGaps).join("|")) {
    pushIssue(issues, "error", "criticalGaps", "criticalGaps", "Critical gaps must be sorted and unique.");
  }
  if (report.warnings.join("|") !== sortedUnique(report.warnings).join("|")) {
    pushIssue(issues, "error", "warnings", "warnings", "Warnings must be sorted and unique.");
  }

  const computedHash = hashValue(stripHash(report));
  if (computedHash !== report.hash) {
    pushIssue(issues, "error", "hash", "hash", "Report hash must match the canonical serialization.");
  }

  const sortedIssues = Object.freeze(issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)));
  const valid = !sortedIssues.some((issue) => issue.severity === "error");

  return Object.freeze({
    valid,
    issues: sortedIssues,
    hash: hashValue({
      valid,
      issues: sortedIssues,
      reportHash: report.hash,
    }),
  });
}
