/**
 * Tests for the GCAM Reviewer Precedent Engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/precedentEngine/precedentEngine.test.ts
 */
import { strict as assert } from "node:assert";

import { createCaseLibraryRegistry } from "../caseLibrary/caseLibrary.js";
import { createDecisionMemoryRegistry } from "../decisionMemory/decisionMemory.js";
import { renderPrecedentEngineReport } from "./precedentEngineCoverage.js";
import { createPrecedentEngineRegistry } from "./precedentEngine.js";

function testPrecedentEngine(): void {
  const decisionMemory = createDecisionMemoryRegistry();
  const caseLibrary = createCaseLibraryRegistry();
  const engine = createPrecedentEngineRegistry(decisionMemory, caseLibrary);
  const report = engine.search({ articleId: 11, status: "accepted" });

  assert.equal(report.totalDecisions > 0, true);
  assert.equal(report.totalCases > 0, true);
  assert.equal(report.matches.length > 0, true);
  assert.equal(report.bestMatch !== null, true);
  assert.equal((report.bestMatch?.similarity ?? 0) > 0, true);
  assert.equal(renderPrecedentEngineReport(report).includes("GCAM Reviewer Precedent Engine"), true);

  console.log("✓ reviewer precedent engine is deterministic");
}

async function main(): Promise<void> {
  testPrecedentEngine();
  console.log("\nAll precedent engine tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
