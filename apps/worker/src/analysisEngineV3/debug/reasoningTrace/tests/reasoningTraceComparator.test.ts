import { strict as assert } from "node:assert";

import { buildReasoningTraceComparatorFromDrafts } from "../comparator/reasoningTraceComparator.js";
import { buildReasoningTraceFixtures } from "./reasoningTraceFixtures.js";

function testComparator(): void {
  const fixtures = buildReasoningTraceFixtures();
  const report = buildReasoningTraceComparatorFromDrafts(fixtures.expected, fixtures.actual);
  const renderedAgain = buildReasoningTraceComparatorFromDrafts(fixtures.expected, fixtures.actual);

  assert.equal(report.hash, renderedAgain.hash);
  assert.equal(report.expectedStageCount, fixtures.expected.length);
  assert.equal(report.actualStageCount, fixtures.actual.length);
  assert.equal(report.missingStageCount, 1);
  assert.equal(report.unexpectedStageCount, 1);
  assert(report.partialStageCount > 0);
  assert(report.stages.some((stage) => stage.stage === "concept_detection" && stage.status === "partial"));
  assert(report.stages.some((stage) => stage.stage === "rejected_interpretations" && stage.status === "missing"));
  assert(report.stages.some((stage) => stage.stage === "finding_generation" && stage.status === "unexpected"));
  console.log("✓ reasoning trace comparator detects matched, missing, unexpected, and partial stages");
}

async function main(): Promise<void> {
  testComparator();
  console.log("\nAll reasoning trace comparator tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
