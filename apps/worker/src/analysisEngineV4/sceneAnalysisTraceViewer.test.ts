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
  findFirstTruthDivergence,
  replaySceneAnalysisTrace,
} from "./sceneAnalysisTraceViewer.js";
import { runSceneAnalysisBenchmark } from "./benchmark/sceneAnalysisBenchmark.js";
import { createBenchmarkFinding, createBenchmarkTraceDocument, createStaticAnalysisEngine } from "./benchmark/benchmarkTestSupport.js";

function normalizeTraceForDeterminism<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T & {
    steps?: Array<{ verification?: { executionTimeMs?: number } }>;
    verificationTrail?: Array<{ executionTimeMs?: number }>;
  };

  const scrub = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        scrub(item);
      }
      return;
    }

    for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
      if (key === "executionTimeMs" || key === "durationMs" || key === "totalMs" || key.endsWith("ExecutionTimeMs") || key.endsWith("DurationMs")) {
        (node as Record<string, unknown>)[key] = 0;
        continue;
      }
      scrub(nested);
    }
  };

  scrub(clone);

  return clone;
}

async function testTraceDocumentsAreDeterministic(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const sceneText = "حاضر. فهد يتمتم: يا كلب";

  const first = await engine.run("scene-trace", sceneText);
  const second = await engine.run("scene-trace", sceneText);

  const firstTrace = normalizeTraceForDeterminism(createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(first)));
  const secondTrace = normalizeTraceForDeterminism(createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(second)));

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

async function testTruthDivergenceHelperFindsFirstMismatch(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const state = await engine.run("scene-truth-divergence", "حاضر. فهد يتمتم: يا كلب");
  const trace = createSceneAnalysisTraceDocument(buildSceneAnalysisTrace(state));
  const cloned = JSON.parse(JSON.stringify(trace)) as typeof trace;
  if (cloned.steps[3]?.after.findingTruth) {
    (cloned.steps[3].after.findingTruth as any).rawEvidenceText = "tampered evidence";
  }

  const divergence = findFirstTruthDivergence(cloned);
  assert.equal(divergence?.node, "candidate_evidence");
  assert.equal(divergence?.reason, "finding_truth_changed");
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
  await testTruthDivergenceHelperFindsFirstMismatch();
  console.log("✓ truth divergence helper locates the first mismatch");
  await testBenchmarkPersistenceStoresTraceDocuments();
  console.log("✓ benchmark execution persists trace documents");
  console.log("\nAll V4 trace viewer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
