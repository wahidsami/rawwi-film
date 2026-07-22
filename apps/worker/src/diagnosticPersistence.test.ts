/**
 * Run: node --import tsx apps/worker/src/diagnosticPersistence.test.ts
 */
import { strict as assert } from "node:assert";
import {
  DEVELOPER_DIAGNOSTIC_TABLES,
  buildRuntimeDiagnosticArtifactBundle,
  clearRuntimeDiagnosticArtifacts,
  getRuntimeDiagnosticArtifacts,
  recordRuntimeDiagnosticArtifact,
  shouldPersistDeveloperDiagnostic,
} from "./diagnosticPersistence.js";

function testProductionModeSkipsDeveloperTables(): void {
  for (const tableName of DEVELOPER_DIAGNOSTIC_TABLES) {
    assert.equal(shouldPersistDeveloperDiagnostic(tableName, "production"), false, `${tableName} should be blocked in production`);
  }
}

function testDevelopmentModeAllowsDeveloperTables(): void {
  for (const tableName of DEVELOPER_DIAGNOSTIC_TABLES) {
    assert.equal(shouldPersistDeveloperDiagnostic(tableName, "development"), true, `${tableName} should be allowed in development`);
  }
}

function testRuntimeArtifactsRemainInMemoryUntilExported(): void {
  const jobId = "job-diagnostic-persistence-test";
  clearRuntimeDiagnosticArtifacts(jobId);

  recordRuntimeDiagnosticArtifact(jobId, {
    tableName: "analysis_judge_diagnostics",
    operation: "insert",
    payload: { kind: "judge_call", findingCount: 2 },
    metadata: { chunkId: "chunk-1" },
    createdAt: "2026-07-22T00:00:00.000Z",
  });
  recordRuntimeDiagnosticArtifact(jobId, {
    tableName: "analysis_runtime_traces",
    operation: "upsert",
    payload: { trace: true },
    metadata: { chunkId: "chunk-1" },
    createdAt: "2026-07-22T00:00:01.000Z",
  });

  const stored = getRuntimeDiagnosticArtifacts(jobId);
  assert.equal(stored.length, 2);
  assert.equal(stored[0]?.tableName, "analysis_judge_diagnostics");
  assert.equal(stored[1]?.tableName, "analysis_runtime_traces");

  const bundle = buildRuntimeDiagnosticArtifactBundle(jobId);
  assert.equal(bundle.jobId, jobId);
  assert.equal(bundle.artifactCount, 2);
  assert.equal(bundle.entries.length, 2);

  clearRuntimeDiagnosticArtifacts(jobId);
  assert.equal(getRuntimeDiagnosticArtifacts(jobId).length, 0);
}

async function main(): Promise<void> {
  testProductionModeSkipsDeveloperTables();
  console.log("✓ production mode blocks every developer diagnostic table");

  testDevelopmentModeAllowsDeveloperTables();
  console.log("✓ development mode allows every developer diagnostic table");

  testRuntimeArtifactsRemainInMemoryUntilExported();
  console.log("✓ runtime diagnostic artifacts remain in memory until exported");

  console.log("\nAll diagnostic persistence tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
