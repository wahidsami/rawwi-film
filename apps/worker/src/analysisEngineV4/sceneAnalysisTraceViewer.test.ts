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
import { createBenchmarkFinding, createBenchmarkTraceDocument, createStaticAnalysisEngine } from "./benchmark/benchmarkTestSupport.js";

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
  assert.equal((firstTrace.decisionProvenanceCollection?.provenance.length ?? 0) > 0, true);
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
  const tracePath = join(tempDir, "benchmark-trace.json");
  const traceDocument = createBenchmarkTraceDocument("scene-benchmark-1", "Scene containing one grounded profanity cue.");
  const staticResult = {
    analysisResponse: {
      promptHash: "benchmark-prompt",
      semanticHash: "benchmark-semantic",
      legalHash: "benchmark-legal",
      stageHashes: [],
      stageTimings: [],
      narrative: {},
      evidence: {},
      semantic: {},
      context: {},
      intelligence: {},
      legalDecision: {},
      diagnostics: {},
    },
    findings: [
      createBenchmarkFinding({
        findingId: "finding-1",
        articleId: 4,
        atomId: "4-1",
        evidenceText: "حاضر. فهد يتمتم: يا كلب",
        titleAr: "الألفاظ النابية",
        descriptionAr: "Grounded evidence expresses Profanity.",
      }),
    ],
    diagnostics: {
      engineVersion: "v4",
      providerName: "benchmark",
      modelName: "benchmark",
      modelVersion: "benchmark",
      rawResponseHash: "benchmark-raw",
      responseId: "benchmark-response",
      responseTimestamp: null,
      promptHash: "benchmark-prompt",
      semanticHash: "benchmark-semantic",
      legalHash: "benchmark-legal",
      executionSignatureHash: "benchmark-execution",
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "benchmark",
      chunkHash: "benchmark-chunk",
      findingCount: 1,
    },
    truthLayerMeta: {
      scene_analysis_trace: traceDocument,
    },
  } as const;
  const staticEngine = createStaticAnalysisEngine(staticResult as any);

  try {
    const report = await runSceneAnalysisBenchmark([
      {
        screenplayId: "benchmark-scene-1",
        sceneId: "scene-benchmark-1",
        sceneText: "حاضر. فهد يتمتم: يا كلب",
        expectedFindings: [],
      },
    ], {
      tracePath,
      engines: {
        v3: staticEngine,
        v4: staticEngine,
      },
    });

    const persisted = JSON.parse(readFileSync(tracePath, "utf8")) as ReadonlyArray<Record<string, unknown> | null>;

    assert.equal(report.cases.length, 1);
    assert.equal(persisted.length, 1);
    assert.deepStrictEqual(persisted[0], report.cases[0]?.traceDocument);
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
