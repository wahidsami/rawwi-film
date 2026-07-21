/**
 * Regression tests for the V4 benchmark framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/benchmark/benchmark.test.ts
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPolicyArticle } from "../../policyMap.js";
import { runSceneAnalysisBenchmark } from "./sceneAnalysisBenchmark.js";
import { createBenchmarkFinding, createBenchmarkTraceDocument, createStaticAnalysisEngine } from "./benchmarkTestSupport.js";

function buildStaticResult() {
  const evidenceText = "حاضر. فهد يتمتم: يا كلب";
  const article = getPolicyArticle(4);
  const traceDocument = createBenchmarkTraceDocument("scene-benchmark-1", "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).");
  const findings = [
    createBenchmarkFinding({
      findingId: "finding-1",
      articleId: 4,
      atomId: "4-1",
      evidenceText,
      titleAr: "الألفاظ النابية",
      descriptionAr: `Grounded evidence "${evidenceText}" expresses Profanity, so the Academy maps it to article 4 (${article?.title_ar ?? "الألفاظ النابية"}).`,
    }),
  ];

  return {
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
    findings,
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
      findingCount: findings.length,
    },
    truthLayerMeta: {
      scene_analysis_trace: traceDocument,
    },
  } as const;
}

function buildCase(): Parameters<typeof runSceneAnalysisBenchmark>[0][number] {
  const article = getPolicyArticle(4);
  const explanation = `Grounded evidence "حاضر. فهد يتمتم: يا كلب" expresses Profanity, so the Academy maps it to article 4 (${article?.title_ar ?? "الألفاظ النابية"}).`;

  return Object.freeze({
    screenplayId: "screenplay-benchmark-1",
    sceneId: "scene-benchmark-1",
    sceneText: "حاضر. فهد يتمتم: يا كلب",
    expectedSceneSummary: "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).",
    expectedFindings: Object.freeze([
      Object.freeze({
        findingId: "finding-1",
        expectedEvidence: Object.freeze({
          text: "حاضر. فهد يتمتم: يا كلب",
          startOffset: 0,
          endOffset: 23,
          lineId: "line-1",
          pageNumber: null,
        }),
        expectedConceptId: "profanity",
        expectedGcamArticleId: 4,
        expectedExplanation: `Grounded evidence "حاضر. فهد يتمتم: يا كلب" expresses Profanity, so the Academy maps it to article 4 (${article?.title_ar ?? "ضوابط المحتوى الإعلامي — تفصيل القواعد الفرعية"}).`,
        expectedAction: "reject",
      }),
    ]),
  });
}

async function testBenchmarkReportIsDeterministic(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "v4-benchmark-"));
  const markdownPath = join(tempDir, "benchmark-results.md");
  const staticResult = buildStaticResult();
  const staticEngine = createStaticAnalysisEngine(staticResult as any);

  try {
    const cases = Object.freeze([buildCase()]);
    const first = await runSceneAnalysisBenchmark(cases, {
      markdownPath,
      engines: {
        v3: staticEngine,
        v4: staticEngine,
      },
    });
    const markdown1 = readFileSync(markdownPath, "utf8");
    const second = await runSceneAnalysisBenchmark(cases, {
      markdownPath,
      engines: {
        v3: staticEngine,
        v4: staticEngine,
      },
    });
    const markdown2 = readFileSync(markdownPath, "utf8");

    assert.deepStrictEqual(first, second);
    assert.equal(first.metrics.findingPrecision, 1);
    assert.equal(first.metrics.findingRecall, 1);
    assert.equal(first.metrics.evidenceAccuracy, 1);
    assert.equal(first.metrics.evidenceSpanAccuracy, 1);
    assert.equal(first.metrics.conceptAccuracy, 1);
    assert.equal(first.metrics.gcamArticleAccuracy, 1);
    assert.equal(first.metrics.explanationAccuracy, 1);
    assert.equal(first.metrics.duplicateFindingRate, 0);
    assert.equal(first.metrics.hallucinationRate, 0);
    assert.equal(first.metrics.overallReviewScore, 1);
    assert.equal(first.cases[0]?.sceneUnderstandingScore.score, 1);
    assert.equal(first.cases[0]?.judgeScore.score, 1);
    assert.equal(first.engineComparisons.v3.length, 1);
    assert.equal(first.engineComparisons.v4.length, 1);
    assert.equal(first.engineExecution.v3.runtimeMs >= 0, true);
    assert.equal(first.engineExecution.v4.runtimeMs >= 0, true);
    assert.equal(markdown1, markdown2);
    assert.equal(markdown1.includes("# V4 Benchmark Report"), true);
    assert.equal(markdown1.includes("## Human Ground Truth"), true);
    assert.equal(markdown1.includes("## Engine Runtime"), true);
    assert.equal(markdown1.includes("screenplay-benchmark-1"), true);
    assert.equal(readFileSync(markdownPath, "utf8"), first.markdown);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testBenchmarkReportIsDeterministic();
  console.log("✓ benchmark report is deterministic");
  console.log("\nAll V4 benchmark framework tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
