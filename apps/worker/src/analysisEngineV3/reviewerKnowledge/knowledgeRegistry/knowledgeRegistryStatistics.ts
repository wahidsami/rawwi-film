import { hashKnowledgeRegistryValue } from "./knowledgeRegistryUtils.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryStatistics, KnowledgeRegistryValidationResult } from "./knowledgeRegistryTypes.js";

function countBy<T extends string>(values: readonly T[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.freeze(Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))));
}

function countTraceable(entries: readonly KnowledgeRegistryEntry[]): number {
  return entries.filter((entry) => Boolean(entry.traceability.source || entry.traceability.sourcePath || entry.traceability.sourceDocumentId)).length;
}

function countExplainable(entries: readonly KnowledgeRegistryEntry[]): number {
  return entries.filter((entry) => entry.explainability.summary.length > 0 || entry.explainability.evidence.length > 0 || entry.explainability.reasoning.length > 0 || entry.explainability.decision !== null).length;
}

export function summarizeKnowledgeRegistryEntries(entries: readonly KnowledgeRegistryEntry[], validation: KnowledgeRegistryValidationResult): KnowledgeRegistryStatistics {
  const kindCounts = countBy(entries.map((entry) => entry.metadata.kind));
  const sourceCounts = countBy(entries.map((entry) => entry.traceability.sourceKind));
  const domainCounts = countBy(entries.map((entry) => entry.metadata.domain ?? "unknown"));
  const traceabilityCoverage = entries.length > 0 ? Number(((countTraceable(entries) / entries.length) * 100).toFixed(3)) : 0;
  const explainabilityCoverage = entries.length > 0 ? Number(((countExplainable(entries) / entries.length) * 100).toFixed(3)) : 0;
  const missingMetadataCount = validation.issues.filter((issue) => issue.code.endsWith(".missing")).length;
  const duplicateIdCount = validation.issues.filter((issue) => issue.code.includes("duplicate")).length;
  const missingReferenceCount = validation.issues.filter((issue) => issue.code === "references.missing").length;
  const circularReferenceCount = validation.issues.filter((issue) => issue.code === "relationships.cycle").length;
  const orphanCount = validation.issues.filter((issue) => issue.code === "relationships.orphan").length;
  const coveragePercent = entries.length > 0 ? Number((((traceabilityCoverage + explainabilityCoverage) / 2)).toFixed(3)) : 0;
  const productionReadiness = validation.valid ? Number((((coveragePercent + 100) / 2)).toFixed(3)) : Number((coveragePercent / 2).toFixed(3));

  return Object.freeze({
    totalCount: entries.length,
    kindCounts,
    sourceCounts,
    domainCounts,
    traceabilityCoverage,
    explainabilityCoverage,
    duplicateIdCount,
    missingMetadataCount,
    missingReferenceCount,
    circularReferenceCount,
    orphanCount,
    coveragePercent,
    productionReadiness,
    hash: hashKnowledgeRegistryValue({
      entries: entries.map((entry) => entry.registryKey),
      validation: validation.hash,
      stats: {
        kindCounts,
        sourceCounts,
        domainCounts,
        traceabilityCoverage,
        explainabilityCoverage,
        duplicateIdCount,
        missingMetadataCount,
        missingReferenceCount,
        circularReferenceCount,
        orphanCount,
        coveragePercent,
        productionReadiness,
      },
    }),
  });
}
