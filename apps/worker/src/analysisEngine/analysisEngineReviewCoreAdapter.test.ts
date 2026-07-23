/**
 * Regression tests for the review-core analysis engine.
 * Run: node --import tsx apps/worker/src/analysisEngine/analysisEngineReviewCoreAdapter.test.ts
 */
import { strict as assert } from "node:assert";

function buildJobContext() {
  return {
    request: {
      jobId: "job-review-core-1",
      chunkId: "chunk-review-core-1",
      scriptId: "script-review-core-1",
      versionId: "version-review-core-1",
      chunkText: "قال: يا كلب",
      chunkStart: 0,
      chunkEnd: 11,
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

async function testReviewCoreAdapterDeterminism(): Promise<void> {
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
                    quotedText: "يا كلب",
                    startOffset: 4,
                    endOffset: 10,
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

  const first = await adapter.execute(buildJobContext());
  const second = await adapter.execute(buildJobContext());

  assert.equal(providerCalls.length, 2);
  assert.equal(first.diagnostics.engineVersion, "review_core");
  assert.equal(second.diagnostics.engineVersion, "review_core");
  assert.deepStrictEqual(first.truthLayerMeta.selected_article_ids, [1]);
  assert.deepStrictEqual(second.truthLayerMeta.selected_article_ids, [1]);
  assert.equal(first.findings.length, 1);
  assert.equal(second.findings.length, 1);
  assert.equal(first.findings[0].article_id, 1);
  assert.equal(first.findings[0].evidence_snippet, "يا كلب");
  assert.equal(second.findings[0].evidence_snippet, "يا كلب");
  assert.equal(first.findings[0].canonical_finding_id, second.findings[0].canonical_finding_id);
  assert.equal(first.findings[0].start_offset_global, second.findings[0].start_offset_global);
  assert.equal(first.findings[0].end_offset_global, second.findings[0].end_offset_global);
}

async function main(): Promise<void> {
  await testReviewCoreAdapterDeterminism();
  console.log("✓ Review core adapter produces stable enriched findings");
  console.log("\nAll review core adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
