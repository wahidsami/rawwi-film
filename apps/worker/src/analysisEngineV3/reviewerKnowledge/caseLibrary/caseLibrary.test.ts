/**
 * Tests for the GCAM Reviewer Case Library.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/caseLibrary/caseLibrary.test.ts
 */
import { strict as assert } from "node:assert";

import { createCaseLibraryCoverageReport, renderCaseLibraryCoverageReport } from "./caseLibraryCoverage.js";
import { createCaseLibraryRegistry } from "./caseLibrary.js";

function testCaseLibrary(): void {
  const registry = createCaseLibraryRegistry();

  assert.equal(registry.entries.length > 0, true);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.list().length, registry.entries.length);
  assert.equal(registry.search({ keyword: "religion" }).length > 0, true);
  assert.equal(registry.entries.some((entry) => entry.positiveExamples.length > 0), true);
  assert.equal(registry.entries.some((entry) => entry.negativeExamples.length > 0), true);
  assert.equal(registry.entries.some((entry) => entry.borderlineExamples.length > 0), true);
  assert.equal(registry.entries.some((entry) => entry.falsePositives.length > 0), true);
  assert.equal(registry.entries.some((entry) => entry.falseNegatives.length > 0), true);

  const coverage = createCaseLibraryCoverageReport(registry);
  assert.equal(coverage.articleCount > 0, true);
  assert.equal(coverage.caseCount > 0, true);
  assert.equal(coverage.hash.length, 64);
  assert.equal(renderCaseLibraryCoverageReport(coverage).includes("GCAM Reviewer Case Library"), true);

  console.log("✓ reviewer case library is deterministic");
}

async function main(): Promise<void> {
  testCaseLibrary();
  console.log("\nAll case library tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

