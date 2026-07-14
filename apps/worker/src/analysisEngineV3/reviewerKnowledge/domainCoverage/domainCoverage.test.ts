/**
 * Run:
 * node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/domainCoverage/domainCoverage.test.ts
 */
import { strict as assert } from "node:assert";

import { createDomainCoverageAnalyzer } from "./domainCoverageAnalyzer.js";
import { createDomainCoverageRegistry } from "./domainCoverageRegistry.js";
import { renderDomainCoverageReport } from "./domainCoverageRenderer.js";
import { validateDomainCoverageReport } from "./domainCoverageValidator.js";

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function testSecurityDomainCoverage(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const report = analyzer.analyze("security");

  assert.equal(report.domainId, "security");
  assertCondition(report.blueprint.coveragePercent === 100, "security blueprint should be complete");
  assertCondition(report.lessons.coveragePercent >= 90, "security lessons should be near complete");
  assert.equal(report.recommendation, "READY");

  const validation = validateDomainCoverageReport(report);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.hash.length, 64);

  const rendered = renderDomainCoverageReport(report);
  assertCondition(rendered.includes("Domain Coverage Report"), "rendered report should include a title");
  assertCondition(rendered.includes("Production Readiness"), "rendered report should include readiness");
  assertCondition(rendered.includes("Coverage Gaps"), "rendered report should include gaps");
  assertCondition(rendered.includes("Warnings"), "rendered report should include warnings");

  console.log("✓ security domain coverage report is valid");
}

function testDeterministicHash(): void {
  const analyzer = createDomainCoverageAnalyzer();
  const first = analyzer.analyze("security");
  const second = analyzer.analyze("security");
  assert.equal(first.hash, second.hash);
  assert.equal(first.metrics.hash, second.metrics.hash);
  console.log("✓ security domain coverage hash is deterministic");
}

function testRegistry(): void {
  const registry = createDomainCoverageRegistry();
  const report = registry.get("security");
  assert(report);
  assert.equal(report?.domainId, "security");
  assertCondition(registry.domains.includes("security"), "registry should discover security");
  assertCondition(registry.list().length >= 1, "registry should contain at least one domain");
  console.log("✓ domain coverage registry discovers domains deterministically");
}

async function main(): Promise<void> {
  testSecurityDomainCoverage();
  testDeterministicHash();
  testRegistry();
  console.log("\nAll domain coverage tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
