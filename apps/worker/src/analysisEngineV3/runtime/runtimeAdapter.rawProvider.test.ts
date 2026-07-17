/**
 * Smoke test for the V3 raw provider test mode.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.rawProvider.test.ts
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

async function createMockOpenAIEndpoint(): Promise<{
  baseURL: string;
  getCapturedRequestBody: () => unknown;
  close: () => Promise<void>;
}> {
  let capturedRequestBody: unknown = null;
  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end("method not allowed");
      return;
    }

    const requestChunks: Buffer[] = [];
    request.on("data", (chunk) => {
      requestChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      const requestBody = Buffer.concat(requestChunks).toString("utf8");
      try {
        capturedRequestBody = JSON.parse(requestBody);
      } catch {
        capturedRequestBody = requestBody;
      }

      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "chatcmpl-raw-test",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "gpt-4.1",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: [
                  "Offending sentence: \"...\"",
                  "Reason: raw provider test mode",
                  "Policy category: test-only",
                ].join("\n"),
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 12,
            total_tokens: 22,
          },
        }),
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    getCapturedRequestBody: () => capturedRequestBody,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function main(): Promise<void> {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalOpenAIBaseURL = process.env.OPENAI_BASE_URL;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalRawProviderTest = process.env.V3_RAW_PROVIDER_TEST;

  const endpoint = await createMockOpenAIEndpoint();
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_BASE_URL = endpoint.baseURL;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";
  process.env.V3_RAW_PROVIDER_TEST = "true";

  try {
    const { runV3RuntimeAdapter } = await import("./runtimeAdapter.js");

    const request: V3RuntimeAdapterRequest = {
      jobId: "job-raw-provider-1",
      chunkId: "chunk-raw-provider-1",
      scriptId: "script-raw-provider-1",
      versionId: "version-raw-provider-1",
      chunkText: "هذا نص تجريبي للكشف الخام عن المخالفات.",
      chunkStart: 0,
      chunkEnd: "هذا نص تجريبي للكشف الخام عن المخالفات.".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك حدث.", "بعدها انتهى المشهد."],
      analysisPromptContext: "Raw provider test mode should bypass the reviewer stack.",
      promptLexiconTerms: [],
    };

    const result = await runV3RuntimeAdapter(request, {
      responseFormat: "json_object",
      subjectModule: {
        id: "v3_01_religion",
        titleAr: "المسائل الدينية الأساسية",
        scope: "Religion fundamentals",
        rules: ["Detect direct religion harm."],
        exclusions: ["Ignore neutral discussion."],
        requiredEvidence: ["Literal religion-related evidence."],
        decisionTree: ["Is there religion signal?", "Is the context blocking?"],
        examples: ["Direct insult to religion."],
        nonExamples: ["Educational mention."],
        articleIds: [1, 2, 3],
        notes: ["Runtime raw-provider test subject module."],
      },
    });

    const capturedRequestBody = endpoint.getCapturedRequestBody() as {
      messages?: Array<{ role?: string; content?: string }>;
      response_format?: { type?: string };
    } | null;

    assert.equal(result.findings.length, 0);
    assert.equal(result.truthLayerMeta.findings_count, 0);
    assert(capturedRequestBody, "OpenAI request body should be captured");
    assert.equal(capturedRequestBody?.response_format, undefined);
    assert.equal(capturedRequestBody?.messages?.[0]?.role, "system");
    assert(
      capturedRequestBody?.messages?.[0]?.content?.includes("You are an expert compliance reviewer."),
      "raw system prompt should use the raw compliance reviewer instruction",
    );
    assert(
      capturedRequestBody?.messages?.[0]?.content?.includes("List every possible violation you can find."),
      "raw system prompt should ask for all possible violations",
    );
    assert(
      !capturedRequestBody?.messages?.[0]?.content?.includes("article-by-article"),
      "raw system prompt must not include the normal article-by-article schema",
    );
    assert(
      !capturedRequestBody?.messages?.[0]?.content?.includes("primaryCandidateIndex"),
      "raw system prompt must not include the normal candidate schema",
    );
    console.log("✓ raw provider mode bypasses reviewer stack");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
    process.env.V3_RAW_PROVIDER_TEST = originalRawProviderTest;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
