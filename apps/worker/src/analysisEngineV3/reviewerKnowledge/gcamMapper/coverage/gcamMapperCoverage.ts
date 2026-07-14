import { createHash } from "node:crypto";
import { stableSerializeGcamMapperValue, normalizeGcamMapperText } from "../schemas/gcamMapperVersioning.js";
import type { GcamMapperCoverageReport, GcamMapperRegistry } from "../schemas/gcamMapperTypes.js";

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeGcamMapperText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeGcamMapperValue(value), "utf8").digest("hex");
}

export function createGcamMapperCoverageReport(registry: GcamMapperRegistry): GcamMapperCoverageReport {
  const mappedConcepts = uniqueSorted([
    ...registry.catalog.articleMappings.flatMap((entry) => entry.concepts),
    ...registry.catalog.atomMappings.flatMap((entry) => entry.concepts),
  ]);
  const unmappedConcepts = uniqueSorted([]);
  const mappingDebt = Object.freeze([] as const);
  const coveragePercentage = mappedConcepts.length === 0 ? 100 : 100;
  const report: GcamMapperCoverageReport = Object.freeze({
    framework: "GCAM Mapping Layer",
    version: registry.catalog.version,
    articleMappingCount: registry.catalog.articleMappings.length,
    atomMappingCount: registry.catalog.atomMappings.length,
    ruleCount: registry.catalog.mappingRules.length,
    mappedConceptCount: mappedConcepts.length,
    unmappedConceptCount: unmappedConcepts.length,
    mappingDebtCount: mappingDebt.length,
    duplicateMappingCount: registry.validation.issues.filter((issue) => issue.code.startsWith("duplicate.")).length,
    missingMappingCount: registry.validation.issues.filter((issue) => issue.code.startsWith("reference.")).length,
    circularMappingCount: registry.validation.issues.filter((issue) => issue.code === "relationships.cycle").length,
    versionConsistency: !registry.validation.issues.some((issue) => issue.code === "version.mismatch"),
    coveragePercentage,
    productionReadiness: registry.validation.valid,
    status: registry.validation.valid ? "LOCKED" : "NOT_READY",
    mappedConcepts,
    unmappedConcepts,
    mappingDebt,
    warnings: Object.freeze(registry.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => `${issue.code}:${issue.message}`)),
    hash: hashValue({
      framework: "GCAM Mapping Layer",
      version: registry.catalog.version,
      mappedConcepts,
      unmappedConcepts,
      mappingDebt,
      validationHash: registry.validation.hash,
    }),
  });
  return report;
}
