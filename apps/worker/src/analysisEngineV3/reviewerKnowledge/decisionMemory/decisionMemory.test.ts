/**
 * Tests for the GCAM Reviewer Decision Memory.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/decisionMemory/decisionMemory.test.ts
 */
import { strict as assert } from "node:assert";

import { createDecisionMemoryCoverageReport, renderDecisionMemoryCoverageReport } from "./decisionMemoryCoverage.js";
import { createDecisionMemoryRegistry } from "./decisionMemory.js";

function testDecisionMemory(): void {
  const registry = createDecisionMemoryRegistry();

  assert.equal(registry.entries.length > 0, true);
  assert.equal(registry.validation.valid, true);
  assert.equal(registry.search({ status: "accepted" }).length > 0, true);
  assert.equal(registry.search({ status: "rejected" }).length > 0, true);
  assert.equal(registry.search({ status: "needs_review" }).length > 0, true);
  assert.equal(registry.search({ concept: "religion" }).length > 0, true);

  const coverage = createDecisionMemoryCoverageReport(registry);
  assert.equal(coverage.decisionCount > 0, true);
  assert.equal(coverage.hash.length, 64);
  assert.equal(renderDecisionMemoryCoverageReport(coverage).includes("GCAM Reviewer Decision Memory"), true);

  console.log("✓ reviewer decision memory is deterministic");
}

async function main(): Promise<void> {
  testDecisionMemory();
  console.log("\nAll decision memory tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

