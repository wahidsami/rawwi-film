/**
 * Regression tests for the V4 regression suite.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/regression/regression.test.ts
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPolicyArticle } from "../../policyMap.js";
import { createBenchmarkFinding, createBenchmarkTraceDocument, createStaticAnalysisEngine } from "../benchmark/benchmarkTestSupport.js";
import { runRegressionSuite } from "./regressionRunner.js";
import { getGoldenRegressionDataset } from "./goldenDataset.js";

function buildStaticResult() {
  const evidenceText = "حاضر. فهد يتمتم: يا كلب";
  const article = getPolicyArticle(4);
  const traceDocument = createBenchmarkTraceDocument("scene-regression-1", "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).");
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
      promptHash: "regression-prompt",
      semanticHash: "regression-semantic",
      legalHash: "regression-legal",
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
      rawResponseHash: "regression-raw",
      responseId: "regression-response",
      responseTimestamp: null,
      promptHash: "regression-prompt",
      semanticHash: "regression-semantic",
      legalHash: "regression-legal",
      executionSignatureHash: "regression-execution",
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "regression",
      chunkHash: "regression-chunk",
      findingCount: findings.length,
    },
    truthLayerMeta: {
      scene_analysis_trace: traceDocument,
    },
  } as const;
}

async function testRegressionSuiteIsDeterministic(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "v4-regression-"));
  const markdownPath = join(tempDir, "regression-results.md");
  const staticResult = buildStaticResult();
  const staticEngine = createStaticAnalysisEngine(staticResult as any);

  try {
    const dataset = getGoldenRegressionDataset();
    const first = await runRegressionSuite(dataset, {
      markdownPath,
      engine: staticEngine,
    });
    const markdown1 = readFileSync(markdownPath, "utf8");
    const second = await runRegressionSuite(dataset, {
      markdownPath,
      engine: staticEngine,
    });
    const markdown2 = readFileSync(markdownPath, "utf8");

    assert.deepStrictEqual(first, second);
    assert.equal(first.metrics.totalCases, dataset.length);
    assert.equal(first.metrics.passedCases, dataset.length);
    assert.equal(first.metrics.failedCases, 0);
    assert.equal(first.metrics.expectedScore, 1);
    assert.equal(first.metrics.actualScore, 1);
    assert.equal(first.metrics.scoreDelta, 0);
    assert.equal(first.cases[0]?.passed, true);
    assert.equal(first.cases[0]?.findingComparisons.length, 1);
    assert.equal(first.cases[0]?.findingComparisons[0]?.failures.length, 0);
    assert.equal(markdown1, markdown2);
    assert.equal(markdown1.includes("# V4 Regression Report"), true);
    assert.equal(markdown1.includes("## Summary"), true);
    assert.equal(markdown1.includes("screenplay-regression-1"), true);
    assert.equal(readFileSync(markdownPath, "utf8"), first.markdown);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testRegressionSuiteIsDeterministic();
  console.log("✓ regression suite is deterministic");
  console.log("\nAll V4 regression suite tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
