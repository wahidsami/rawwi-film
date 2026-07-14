import { strict as assert } from "node:assert";

import { buildReasoningTraceComparatorFromDrafts } from "../comparator/reasoningTraceComparator.js";
import { buildReasoningTraceCoverageReport, renderReasoningTraceCoverageReport } from "../coverage/reasoningTraceCoverage.js";
import { buildReasoningTraceFixtures } from "./reasoningTraceFixtures.js";

function testCoverage(): void {
  const fixtures = buildReasoningTraceFixtures();
  const comparatorReport = buildReasoningTraceComparatorFromDrafts(fixtures.expected, fixtures.actual);
  const coverageReport = buildReasoningTraceCoverageReport(comparatorReport);
  const coverageReportAgain = buildReasoningTraceCoverageReport(comparatorReport);

  assert.equal(coverageReport.hash, coverageReportAgain.hash);
  assert.equal(coverageReport.missingStageCount, 1);
  assert.equal(coverageReport.unexpectedStageCount, 1);
  assert.equal(coverageReport.readyForProduction, false);
  const rendered = renderReasoningTraceCoverageReport(coverageReport);
  assert(rendered.includes("## Reasoning Trace Coverage Report"));
  assert(rendered.includes("Missing Stage IDs"));
  assert(rendered.includes("Unexpected Stage IDs"));
  console.log("✓ reasoning trace coverage is deterministic");
}

async function main(): Promise<void> {
  testCoverage();
  console.log("\nAll reasoning trace coverage tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
