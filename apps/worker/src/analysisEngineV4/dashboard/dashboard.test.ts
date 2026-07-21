/**
 * Regression tests for the V4 cognitive dashboard.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/dashboard/dashboard.test.ts
 */
import { strict as assert } from "node:assert";

import { getPolicyArticle } from "../../policyMap.js";
import { createBenchmarkFinding, createBenchmarkTraceDocument } from "../benchmark/benchmarkTestSupport.js";
import { buildV4ReportAdapter } from "../report/reportAdapter.js";
import { buildCognitiveDashboard } from "./cognitiveDashboard.js";
import { serializeCognitiveDashboard } from "./dashboardSerializer.js";

function buildDashboard() {
  const evidenceText = "حاضر. فهد يتمتم: يا كلب";
  const traceDocument = createBenchmarkTraceDocument("scene-dashboard-1", "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).");
  const findings = [
    createBenchmarkFinding({
      findingId: "finding-1",
      articleId: 4,
      atomId: "4-1",
      evidenceText,
      titleAr: getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية",
      descriptionAr: `Grounded evidence "${evidenceText}" expresses Profanity, so the Academy maps it to article 4.`,
    }),
  ];
  const reportAdapterResult = buildV4ReportAdapter({
    sceneId: "scene-dashboard-1",
    jobId: "job-dashboard-1",
    scriptId: "script-dashboard-1",
    versionId: "version-dashboard-1",
    chunkId: "chunk-dashboard-1",
    findings,
    verifiedFindingCollection: null,
    decisionProvenanceCollection: null,
  });

  return buildCognitiveDashboard({
    traceDocument,
    reportAdapterResult,
    estimatedCostUsd: 0.0042,
  });
}

function testDashboardIsDeterministic(): void {
  const first = buildDashboard();
  const second = buildDashboard();

  assert.deepStrictEqual(first, second);
  assert.equal(first.nodes.length, 8);
  assert.equal(first.nodes[0]?.title, "Scene Understanding");
  assert.equal(first.nodes[1]?.title, "Semantic Interpretation");
  assert.equal(first.nodes[2]?.title, "Evidence");
  assert.equal(first.nodes[3]?.title, "Concepts");
  assert.equal(first.nodes[4]?.title, "Legal Mapping");
  assert.equal(first.nodes[5]?.title, "Explanation");
  assert.equal(first.nodes[6]?.title, "Judge");
  assert.equal(first.nodes[7]?.title, "Report");
  assert.equal(first.html.includes("V4 Cognitive Dashboard"), true);
  assert.equal(first.html.includes("Replay"), true);
  assert.equal(first.html.includes("Trace Document"), true);
  assert.equal(first.html.includes("Read-only developer view"), true);
  assert.equal(first.nodes.some((node) => node.errors.length > 0), true);
  assert.equal(serializeCognitiveDashboard(first), serializeCognitiveDashboard(second));
}

function main(): void {
  testDashboardIsDeterministic();
  console.log("✓ cognitive dashboard is deterministic");
  console.log("\nAll V4 cognitive dashboard tests passed.");
}

main();
