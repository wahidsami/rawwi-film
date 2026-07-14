import { createHash } from "node:crypto";

import type { DomainCoverageMetrics, DomainCoverageSection, DomainCoverageTopicMetric } from "./domainCoverageTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

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

function roundCoverage(present: number, expected: number): number {
  if (expected <= 0) {
    return present > 0 ? 100 : 0;
  }
  return Number(((present / expected) * 100).toFixed(3));
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function createDomainCoverageSection(
  title: string,
  present: number,
  expected: number,
  missing: readonly string[] = [],
  warnings: readonly string[] = [],
  notes: readonly string[] = [],
): DomainCoverageSection {
  const section = Object.freeze({
    title,
    present,
    expected,
    coveragePercent: roundCoverage(present, expected),
    missing: sortedUnique(missing),
    warnings: sortedUnique(warnings),
    notes: sortedUnique(notes),
  });

  return Object.freeze({
    ...section,
    hash: hashValue(section),
  });
}

export function createDomainCoverageTopicMetric(
  id: string,
  title: string,
  present: number,
  expected: number,
  evidence: readonly string[] = [],
  missing: readonly string[] = [],
): DomainCoverageTopicMetric {
  return Object.freeze({
    id,
    title,
    present,
    expected,
    coveragePercent: roundCoverage(present, expected),
    evidence: sortedUnique(evidence),
    missing: sortedUnique(missing),
  });
}

export function computeDomainProductionReadiness(sections: readonly DomainCoverageSection[]): number {
  if (sections.length === 0) {
    return 0;
  }

  const minCoverage = Math.min(...sections.map((section) => section.coveragePercent));
  return Math.floor(minCoverage);
}

export function createDomainCoverageMetrics(input: Omit<DomainCoverageMetrics, "hash">): DomainCoverageMetrics {
  const metrics = Object.freeze({
    ...input,
    topics: Object.freeze([...input.topics].sort((left, right) => left.id.localeCompare(right.id))),
  });

  return Object.freeze({
    ...metrics,
    hash: hashValue(metrics),
  });
}

