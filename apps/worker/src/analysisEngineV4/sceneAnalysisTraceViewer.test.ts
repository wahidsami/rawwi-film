/**
 * Regression tests for the V4 trace viewer and benchmark trace persistence.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/sceneAnalysisTraceViewer.test.ts
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSceneAnalysisEngine } from "./sceneAnalysisEngine.js";
import {
  buildSceneAnalysisTrace,
  createSceneAnalysisTraceDocument,
  replaySceneAnalysisTrace,
} from "./sceneAnalysisTraceViewer.js";
import { runSceneAnalysisBenchmark } from "./benchmark/sceneAnalysisBenchmark.js";

async function testTraceDocumentsAreDeterministic(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const sceneText = "حاضر. فهد يتمتم: يا كلب";

  const first = await engine.run("scene-trace", sceneText);
  const second = await engine.run("scene-trace", sceneText);

  const firstTrace = createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(first));
  const secondTrace = createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(second));

  assert.deepStrictEqual(firstTrace, secondTrace);
  assert.equal(JSON.stringify(firstTrace), JSON.stringify(secondTrace));
  assert.equal(firstTrace.nodeExecutionOrder[0], "understand_scene");
  assert.equal(firstTrace.steps.at(-1)?.after.selectedArticle?.articleId, 4);
}

async function testTraceReplayStartsFromRequestedNode(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const state = await engine.run("scene-trace-replay", "حاضر. فهد يتمتم: يا كلب");
  const trace = buildSceneAnalysisTrace(state);
  const replay = replaySceneAnalysisTrace(trace, "explanation");

  assert.equal(replay.startingNode, "explanation");
  assert.equal(replay.startingNodeIndex, 5);
  assert.equal(replay.remainingNodeExecutionOrder[0], "explanation");
  assert.equal(replay.steps[0]?.node, "explanation");
  assert.equal(replay.startingView.knowledgeDomains.includes("profanity"), true);
  assert.equal(replay.startingView.candidateArticles.length > 0, true);
  assert.equal((replay.startingView.semanticSceneModel?.summary.length ?? 0) > 0, true);
}

async function testBenchmarkPersistenceStoresTraceDocuments(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "v4-trace-"));
  const traceFilePath = join(tempDir, "benchmark-trace.json");

  try {
    const report = await runSceneAnalysisBenchmark([
      {
        screenplayId: "benchmark-scene-1",
        sceneId: "scene-benchmark-1",
        sceneText: "حاضر. فهد يتمتم: يا كلب",
        expectedFindings: [],
      },
    ], { traceFilePath });

    const persisted = JSON.parse(readFileSync(traceFilePath, "utf8")) as {
      cases: ReadonlyArray<{
        traceDocument: Record<string, unknown>;
      }>;
    };

    assert.equal(report.cases.length, 1);
    assert.equal(persisted.cases.length, 1);
    assert.deepStrictEqual(persisted.cases[0]?.traceDocument, report.cases[0]?.traceDocument);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testTraceDocumentsAreDeterministic();
  console.log("✓ trace documents are deterministic");
  await testTraceReplayStartsFromRequestedNode();
  console.log("✓ trace replay starts from an arbitrary node");
  await testBenchmarkPersistenceStoresTraceDocuments();
  console.log("✓ benchmark execution persists trace documents");
  console.log("\nAll V4 trace viewer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
