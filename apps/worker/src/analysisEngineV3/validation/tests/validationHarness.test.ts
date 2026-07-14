import { strict as assert } from "node:assert";

import { VALIDATION_FIXTURES } from "../fixtures/validationFixtures.js";
import { VALIDATION_EXPECTED_CASE_IDS } from "../expected/validationExpected.js";
import { createValidationRunner } from "../runner/validationRunner.js";
import { renderValidationReport } from "../reports/validationReportRenderer.js";

function testValidationHarness(): void {
  const runner = createValidationRunner();
  const report = runner.run(VALIDATION_FIXTURES);
  const renderedFirst = renderValidationReport(report);
  const renderedSecond = renderValidationReport(report);

  assert.equal(renderedFirst, renderedSecond);
  assert.equal(report.cases.length, VALIDATION_FIXTURES.length);
  assert.equal(report.summary.status, "NOT_READY");
  assert.equal(report.summary.recommendation, "NOT READY FOR RUNTIME");
  assert.equal(report.summary.productionReadiness, false);
  assert.equal(report.summary.hash.length, 64);
  assert.equal(report.metrics.totalCases, VALIDATION_FIXTURES.length);
  assert.equal(report.reasoning.traceCount, VALIDATION_FIXTURES.length);
  assert(report.statistics.totalReasoningStages > 0);
  assert.equal(report.statistics.totalCases, VALIDATION_FIXTURES.length);
  assert.equal(report.coverage.hash.length, 64);
  assert.equal(report.knowledgeGaps.hash.length, 64);
  assert.deepStrictEqual(VALIDATION_EXPECTED_CASE_IDS, VALIDATION_FIXTURES.map((entry) => entry.id));
  assert(renderedFirst.includes("# V3 Offline Validation Harness Report"));
  assert(renderedFirst.includes("## Metrics"));
  assert(renderedFirst.includes("## Coverage Report"));
  assert(renderedFirst.includes("## Reasoning Report"));
  assert(renderedFirst.includes("## Knowledge Gap Report"));
  assert(renderedFirst.includes("## Cases"));
  assert(renderedFirst.includes("NOT READY FOR RUNTIME"));
  console.log("✓ V3 offline validation harness is deterministic and renders a complete report");
}

async function main(): Promise<void> {
  testValidationHarness();
  console.log("\nAll V3 offline validation harness tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
