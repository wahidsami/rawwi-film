/**
 * Regression tests for the V4 human evaluation framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/evaluation/evaluation.test.ts
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPolicyArticle } from "../../policyMap.js";
import { createBenchmarkFinding, createBenchmarkTraceDocument, createStaticAnalysisEngine } from "../benchmark/benchmarkTestSupport.js";
import { runHumanEvaluationSession } from "./evaluationSession.js";
import type { BenchmarkScreenplay } from "../benchmark/benchmarkTypes.js";

function buildStaticResult() {
  const evidenceText = "حاضر. فهد يتمتم: يا كلب";
  const article = getPolicyArticle(4);
  const traceDocument = createBenchmarkTraceDocument("scene-evaluation-1", "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).");
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
      promptHash: "evaluation-prompt",
      semanticHash: "evaluation-semantic",
      legalHash: "evaluation-legal",
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
      rawResponseHash: "evaluation-raw",
      responseId: "evaluation-response",
      responseTimestamp: null,
      promptHash: "evaluation-prompt",
      semanticHash: "evaluation-semantic",
      legalHash: "evaluation-legal",
      executionSignatureHash: "evaluation-execution",
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "evaluation",
      chunkHash: "evaluation-chunk",
      findingCount: findings.length,
    },
    truthLayerMeta: {
      scene_analysis_trace: traceDocument,
    },
  } as const;
}

function buildCase(): BenchmarkScreenplay {
  const article = getPolicyArticle(4);
  const sceneText = "حاضر. فهد يتمتم: يا كلب";
  return Object.freeze({
    screenplayId: "screenplay-evaluation-1",
    sceneId: "scene-evaluation-1",
    sceneText,
    expectedSceneSummary: "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).",
    expectedFindings: Object.freeze([
      Object.freeze({
        findingId: "finding-1",
        expectedEvidence: Object.freeze({
          text: sceneText,
          startOffset: 0,
          endOffset: 23,
          lineId: "line-1",
          pageNumber: null,
        }),
        expectedConceptId: "profanity",
        expectedGcamArticleId: 4,
        expectedExplanation: `Grounded evidence "${sceneText}" expresses Profanity, so the Academy maps it to article 4 (${article?.title_ar ?? "الألفاظ النابية"}).`,
        expectedAction: "reject",
      }),
    ]),
  });
}

async function testEvaluationSessionIsDeterministic(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "v4-evaluation-"));
  const markdownPath = join(tempDir, "evaluation-results.md");
  const staticResult = buildStaticResult();
  const staticEngine = createStaticAnalysisEngine(staticResult as any);

  try {
    const cases = Object.freeze([buildCase()]);
    const first = await runHumanEvaluationSession(cases, {
      markdownPath,
      engines: {
        v3: staticEngine,
        v4: staticEngine,
      },
    });
    const markdown1 = readFileSync(markdownPath, "utf8");
    const second = await runHumanEvaluationSession(cases, {
      markdownPath,
      engines: {
        v3: staticEngine,
        v4: staticEngine,
      },
    });
    const markdown2 = readFileSync(markdownPath, "utf8");

    assert.deepStrictEqual(first, second);
    assert.equal(first.cases.length, 1);
    assert.equal(first.cases[0]?.humanScore.precision, 1);
    assert.equal(first.cases[0]?.v3Score.precision, 1);
    assert.equal(first.cases[0]?.v4Score.precision, 1);
    assert.equal(first.pairwiseAgreement.humanVsV3.kappa, 1);
    assert.equal(first.pairwiseAgreement.humanVsV4.kappa, 1);
    assert.equal(first.pairwiseAgreement.v3VsV4.kappa, 1);
    assert.equal(first.metrics.precision, 1);
    assert.equal(first.metrics.recall, 1);
    assert.equal(first.metrics.f1, 1);
    assert.equal(first.metrics.cohenKappa, 1);
    assert.equal(markdown1, markdown2);
    assert.equal(markdown1.includes("# V4 Human Evaluation Report"), true);
    assert.equal(markdown1.includes("## Blind Comparison"), true);
    assert.equal(markdown1.includes("screenplay-evaluation-1"), true);
    assert.equal(readFileSync(markdownPath, "utf8"), first.markdown);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testEvaluationSessionIsDeterministic();
  console.log("✓ human evaluation session is deterministic");
  console.log("\nAll V4 human evaluation framework tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
