import assert from "node:assert/strict";

import { extractShadowV4Reports, type ShadowChunkRunRow } from "./v4ShadowReportCLI.js";

function buildRow(overrides: Partial<ShadowChunkRunRow> = {}): ShadowChunkRunRow {
  return {
    job_id: "job-1",
    run_key: "shadow:run:chunk-1",
    truth_layer_meta: {
      runtime_orchestrator: {
        report: {
          sceneId: "scene-1",
          findingsCount: 2,
        },
      },
      report: {
        sceneId: "scene-1",
        findingsCount: 2,
      },
    },
    ...overrides,
  };
}

function testExtractsRuntimeOrchestratorReport(): void {
  const result = extractShadowV4Reports([buildRow()]);
  assert.equal(result.jobId, "job-1");
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0]?.report?.findingsCount, 2);
  assert.equal(result.reports[0]?.runtimeOrchestrator?.report ? true : false, true);
}

function testFallsBackToTruthLayerReport(): void {
  const result = extractShadowV4Reports([buildRow({
      truth_layer_meta: {
        report: {
          sceneId: "scene-2",
        findingsCount: 1,
      },
    },
  })]);
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0]?.report?.sceneId, "scene-2");
}

function testSkipsRowsWithoutReport(): void {
  const result = extractShadowV4Reports([buildRow({
    truth_layer_meta: {
      runtime_orchestrator: {},
    },
  })]);
  assert.equal(result.reports.length, 0);
}

function main(): void {
  testExtractsRuntimeOrchestratorReport();
  testFallsBackToTruthLayerReport();
  testSkipsRowsWithoutReport();
  console.log("✓ V4 shadow report CLI extraction tests passed");
}

main();
