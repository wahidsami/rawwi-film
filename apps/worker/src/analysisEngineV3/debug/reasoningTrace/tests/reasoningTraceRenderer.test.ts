import { strict as assert } from "node:assert";

import { buildReasoningTraceComparatorFromDrafts } from "../comparator/reasoningTraceComparator.js";
import { renderReasoningTraceComparatorReport } from "../renderer/reasoningTraceComparatorRenderer.js";
import { buildReasoningTraceFixtures } from "./reasoningTraceFixtures.js";

function testRenderer(): void {
  const fixtures = buildReasoningTraceFixtures();
  const report = buildReasoningTraceComparatorFromDrafts(fixtures.expected, fixtures.actual);
  const renderedFirst = renderReasoningTraceComparatorReport(report);
  const renderedSecond = renderReasoningTraceComparatorReport(report);

  assert.equal(renderedFirst, renderedSecond);
  assert(renderedFirst.includes("# Reasoning Trace Comparator Report"));
  assert(renderedFirst.includes("## Stage Comparison"));
  assert(renderedFirst.includes("## Reasoning Trace Coverage Report"));
  assert(renderedFirst.includes("## Reasoning Trace Timeline"));
  console.log("✓ reasoning trace renderer is deterministic");
}

async function main(): Promise<void> {
  testRenderer();
  console.log("\nAll reasoning trace renderer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
