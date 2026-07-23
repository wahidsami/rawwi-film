/**
 * Regression tests for the pluggable analysis engine adapter.
 * Run: node --import tsx apps/worker/src/analysisEngine/engineFactory.test.ts
 */
import { strict as assert } from "node:assert";

import { create } from "./engineFactory.js";
import type { AnalysisEngine, AnalysisResult } from "./types.js";

function buildJobContext() {
  return {
    request: {
      jobId: "job-1",
      chunkId: "chunk-1",
      scriptId: "script-1",
      versionId: "version-1",
      chunkText: "حاضر. فهد يتمتم: يا كلب",
      chunkStart: 0,
      chunkEnd: 23,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: null,
      sceneMemory: null,
      neighboringSentences: [],
      analysisPromptContext: null,
      promptLexiconTerms: [],
      analysisSignatureContext: null,
      diagnosticsEnabled: false,
    },
    options: {
      policySelectedArticleIds: [1],
    },
  } as const;
}

function createStubEngine(name: string): AnalysisEngine {
  return Object.freeze({
    async execute(): Promise<AnalysisResult> {
      return {
        analysisResponse: {
          promptHash: `${name}:prompt`,
          semanticHash: `${name}:semantic`,
          legalHash: `${name}:legal`,
          stageHashes: [],
          stageTimings: [],
          narrative: {} as AnalysisResult["analysisResponse"]["narrative"],
          evidence: {} as AnalysisResult["analysisResponse"]["evidence"],
          semantic: {} as AnalysisResult["analysisResponse"]["semantic"],
          context: {} as AnalysisResult["analysisResponse"]["context"],
          intelligence: {} as AnalysisResult["analysisResponse"]["intelligence"],
          legalDecision: {} as AnalysisResult["analysisResponse"]["legalDecision"],
          diagnostics: {
            engineVersion: "v3",
            providerName: name,
            modelName: name,
            modelVersion: null,
            rawResponseHash: `${name}:raw`,
            responseId: null,
            responseTimestamp: null,
            promptHash: `${name}:prompt`,
            semanticHash: `${name}:semantic`,
            legalHash: `${name}:legal`,
            executionSignatureHash: `${name}:sig`,
            stageHashes: [],
            stageTimings: [],
            subjectModuleId: name,
            chunkHash: `${name}:chunk`,
            findingCount: 0,
          },
        },
        findings: [],
        diagnostics: {
          engineVersion: "v3",
          providerName: name,
          modelName: name,
          modelVersion: null,
          rawResponseHash: `${name}:raw`,
          responseId: null,
          responseTimestamp: null,
          promptHash: `${name}:prompt`,
          semanticHash: `${name}:semantic`,
          legalHash: `${name}:legal`,
          executionSignatureHash: `${name}:sig`,
          stageHashes: [],
          stageTimings: [],
          subjectModuleId: name,
          chunkHash: `${name}:chunk`,
          findingCount: 0,
        },
        truthLayerMeta: { engine: name },
      } as any;
    },
  });
}

async function testEngineFactorySelection(): Promise<void> {
  const v3Engine = create({
    env: { ANALYSIS_ENGINE: "v3" },
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });
  const v4Engine = create({
    env: { ANALYSIS_ENGINE: "v4" },
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });
  const shadowEngine = create({
    env: { ANALYSIS_ENGINE: "shadow" },
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });
  const reviewCoreEngine = create({
    env: { ANALYSIS_ENGINE: "review_core" },
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });
  const fallbackEngine = create({
    env: { ANALYSIS_ENGINE: "banana" },
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });
  const defaultEngine = create({
    v3Adapter: createStubEngine("v3"),
    v4Adapter: createStubEngine("v4"),
    reviewCoreAdapter: createStubEngine("review_core"),
  });

  assert.equal((await v3Engine.execute(buildJobContext())).truthLayerMeta.engine, "v3");
  assert.equal((await v4Engine.execute(buildJobContext())).truthLayerMeta.engine, "v4");
  assert.equal((await shadowEngine.execute(buildJobContext())).truthLayerMeta.engine, "v3");
  assert.equal((await reviewCoreEngine.execute(buildJobContext())).truthLayerMeta.engine, "review_core");
  assert.equal((await fallbackEngine.execute(buildJobContext())).truthLayerMeta.engine, "review_core");
  assert.equal((await defaultEngine.execute(buildJobContext())).truthLayerMeta.engine, "review_core");
}

async function testV3AdapterDelegates(): Promise<void> {
  let called = 0;
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = "https://example.supabase.co";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const { createAnalysisEngineV3Adapter } = await import("./analysisEngineV3Adapter.js");
  const adapter = createAnalysisEngineV3Adapter({
    runV3RuntimeAdapter: (async (input: any, options: any) => {
      called += 1;
      assert.equal(input.jobId, "job-1");
      assert.equal(input.chunkText, "حاضر. فهد يتمتم: يا كلب");
      assert.deepStrictEqual(options, { policySelectedArticleIds: [1] });
      return {
        analysisResponse: {
          promptHash: "prompt",
          semanticHash: "semantic",
          legalHash: "legal",
          stageHashes: [],
          stageTimings: [],
          narrative: {} as AnalysisResult["analysisResponse"]["narrative"],
          evidence: {} as AnalysisResult["analysisResponse"]["evidence"],
          semantic: {} as AnalysisResult["analysisResponse"]["semantic"],
          context: {} as AnalysisResult["analysisResponse"]["context"],
          intelligence: {} as AnalysisResult["analysisResponse"]["intelligence"],
          legalDecision: {} as AnalysisResult["analysisResponse"]["legalDecision"],
          diagnostics: {
            engineVersion: "v3",
            providerName: "stub",
            modelName: "stub",
            modelVersion: null,
            rawResponseHash: "raw",
            responseId: null,
            responseTimestamp: null,
            promptHash: "prompt",
            semanticHash: "semantic",
            legalHash: "legal",
            executionSignatureHash: "sig",
            stageHashes: [],
            stageTimings: [],
            subjectModuleId: "stub",
            chunkHash: "chunk",
            findingCount: 0,
          },
        } as unknown as AnalysisResult["analysisResponse"],
        findings: [],
        diagnostics: {
          engineVersion: "v3",
          providerName: "stub",
          modelName: "stub",
          modelVersion: null,
          rawResponseHash: "raw",
          responseId: null,
          responseTimestamp: null,
          promptHash: "prompt",
          semanticHash: "semantic",
          legalHash: "legal",
          executionSignatureHash: "sig",
          stageHashes: [],
          stageTimings: [],
          subjectModuleId: "stub",
          chunkHash: "chunk",
          findingCount: 0,
        },
        truthLayerMeta: {},
      } as any;
    }) as any,
  });

  await adapter.execute(buildJobContext());
  assert.equal(called, 1);
}

async function testV4AdapterContract(): Promise<void> {
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = "https://example.supabase.co";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const { createAnalysisEngineV4Adapter } = await import("./analysisEngineV4Adapter.js");
  const adapter = createAnalysisEngineV4Adapter();
  const result = await adapter.execute(buildJobContext());

  assert.equal(typeof result.analysisResponse.promptHash, "string");
  assert.equal(Array.isArray(result.analysisResponse.stageHashes), true);
  assert.equal(Array.isArray(result.analysisResponse.stageTimings), true);
  assert.equal(result.diagnostics.engineVersion, "v4");
  assert.equal(Array.isArray(result.findings), true);
  assert.equal(typeof result.truthLayerMeta, "object");
}

async function testReviewCoreAdapterContract(): Promise<void> {
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = "https://example.supabase.co";
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const { createAnalysisEngineReviewCoreAdapter } = await import("./analysisEngineReviewCoreAdapter.js");
  const providerCalls: Array<{ systemPrompt: string; userPrompt: string }> = [];
  const adapter = createAnalysisEngineReviewCoreAdapter({
    providerFactory: {
      create() {
        return {
          name: "openai",
          async callJudgeRaw(input: any) {
            providerCalls.push({ systemPrompt: input.systemPrompt, userPrompt: input.userPrompt });
            return {
              providerName: "openai",
              modelName: "stub-model",
              modelVersion: "stub-version",
              rawResponse: JSON.stringify({
                findings: [
                  {
                    articleId: 1,
                    atomId: null,
                    quotedText: "يا كلب",
                    startOffset: 7,
                    endOffset: 13,
                    reason: "insult",
                    confidence: 0.91,
                  },
                ],
              }),
              finishReason: "stop",
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
              responseId: "response-1",
              responseTimestamp: "2026-07-23T00:00:00.000Z",
            };
          },
        };
      },
    } as any,
    getJobResources: async () => ({
      pageRows: [{ page_number: 1, content: "قال: يا كلب" }],
      promptLexiconTerms: [],
    }),
  });

  const result = await adapter.execute(buildJobContext());

  assert.equal(providerCalls.length, 1);
  assert.equal(result.diagnostics.engineVersion, "review_core");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].article_id, 1);
  assert.equal(result.findings[0].evidence_snippet.includes("يا كلب"), true);
  assert.deepStrictEqual(result.truthLayerMeta.selected_article_ids, [1]);
}

async function main(): Promise<void> {
  await testEngineFactorySelection();
  console.log("✓ engineFactory selects V3/V4, supports shadow, and falls back to V3");
  await testV3AdapterDelegates();
  console.log("✓ V3 adapter delegates correctly");
  await testV4AdapterContract();
  console.log("✓ V4 adapter returns the shared AnalysisResult contract");
  await testReviewCoreAdapterContract();
  console.log("✓ Review core adapter returns a shared AnalysisResult contract");
  console.log("\nAll analysis engine adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
