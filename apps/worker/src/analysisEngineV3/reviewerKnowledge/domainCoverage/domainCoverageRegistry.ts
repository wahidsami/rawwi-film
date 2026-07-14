import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeDomainCoverage, createDomainCoverageAnalyzer, discoverDomainCoverageDomains } from "./domainCoverageAnalyzer.js";
import { validateDomainCoverageReport } from "./domainCoverageValidator.js";
import type { DomainCoverageRegistry, DomainCoverageRegistryEntry } from "./domainCoverageTypes.js";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function sortEntries(entries: readonly DomainCoverageRegistryEntry[]): readonly DomainCoverageRegistryEntry[] {
  return Object.freeze([...entries].sort((left, right) => left.domainId.localeCompare(right.domainId)));
}

function buildRegistry(rootDir: string): DomainCoverageRegistry {
  let domains = discoverDomainCoverageDomains(rootDir);
  let reports = sortEntries(domains.map((domainId) => {
    const report = analyzeDomainCoverage(domainId, rootDir);
    const validation = validateDomainCoverageReport(report);
    if (!validation.valid) {
      // keep the report, but the registry hash includes the invalid state via report hash
    }
    return Object.freeze({ domainId, report });
  }));

  const refresh = (): void => {
    domains = discoverDomainCoverageDomains(rootDir);
    reports = sortEntries(domains.map((domainId) => Object.freeze({ domainId, report: analyzeDomainCoverage(domainId, rootDir) })));
  };

  return Object.freeze({
    rootDir,
    get domains(): readonly string[] {
      return Object.freeze([...domains]);
    },
    get reports(): readonly DomainCoverageRegistryEntry[] {
      return Object.freeze([...reports]);
    },
    get hash(): string {
      return hashValue(reports.map((entry) => entry.report.hash));
    },
    list: () => Object.freeze([...reports]),
    get: (domainId: string) => reports.find((entry) => entry.domainId === normalizeText(domainId))?.report ?? null,
    analyze: (domainId: string) => analyzeDomainCoverage(normalizeText(domainId), rootDir),
    refresh,
  });
}

export function createDomainCoverageRegistry(rootDir = DEFAULT_ROOT): DomainCoverageRegistry {
  return buildRegistry(rootDir);
}
