/**
 * Smoke tests for the V3 runtime adapter.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.test.ts
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Character A",
      listener: "religious_group",
      target: "religious_group",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "attack",
      storyPosition: "escalation",
      relationship: "enemy",
      emotionalTone: "hostile",
      condemnation: false,
      approval: false,
      neutrality: false,
      historicalContext: false,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.97,
    },
    evidence: {
      candidates: [
        {
          text: "النبي كذاب والدين باطل",
          startOffset: 4,
          endOffset: 24,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "هذا الدين سخيف",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "religious_group",
      target: "religious_group",
      victim: "religious_group",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "The scene is hostile.",
      sceneMemory: "Interior confrontation.",
      localContext: "هذا الدين سخيف",
      chunkContext: "Chunk context",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      narrativeContext: "Direct hostile dialogue about religion.",
      confidence: 0.95,
    },
  };

  return JSON.stringify({
    reasoning,
    metadata: {
      model: "gpt-4.1",
    },
  });
}

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
      const body = buildMockOpenAIResponse();
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "gpt-4.1",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: body,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        }),
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseURL = `http://127.0.0.1:${address.port}/v1`;
  return {
    baseURL,
    getCapturedRequestBody: () => capturedRequestBody,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function testReligionModuleIsReachableAtRuntime(): Promise<void> {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalOpenAIBaseURL = process.env.OPENAI_BASE_URL;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const endpoint = await createMockOpenAIEndpoint();
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_BASE_URL = endpoint.baseURL;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";

  try {
    const { runV3RuntimeAdapter } = await import("./runtimeAdapter.js");

    const request: V3RuntimeAdapterRequest = {
      jobId: "job-religion-1",
      chunkId: "chunk-religion-1",
      scriptId: "script-religion-1",
      versionId: "version-religion-1",
      chunkText: "النبي كذاب والدين باطل",
      chunkStart: 0,
      chunkEnd: "النبي كذاب والدين باطل".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      analysisPromptContext: "Religion content should route through the religion module.",
      promptLexiconTerms: [
        {
          term: "الدين",
          gcam_article_id: 3,
          severity_floor: "low",
          gcam_article_title_ar: "المساس بالدين",
          term_variants: ["الإسلام"],
          description: "Religion anchor.",
          example_usage: "الدين باطل",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
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
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    const gcamMapping = result.truthLayerMeta.gcam_mapping as { status?: string };
    const capturedRequestBody = endpoint.getCapturedRequestBody() as {
      messages?: Array<{ content?: string }>;
      response_format?: { type?: string };
    } | null;
    assert.equal(result.diagnostics.subjectModuleId, "v3_01_religion");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_01_religion");
    assert.equal(result.findings.length > 0, true, "religion module should be reachable at runtime");
    assert.equal(gcamMapping.status, "MAPPED");
    assert(capturedRequestBody, "OpenAI request body should be captured");
    assert.equal(capturedRequestBody?.response_format?.type, "json_object");
    assert(
      capturedRequestBody?.messages?.[0]?.content?.includes('"candidates"'),
      "system prompt should explicitly request evidence candidates",
    );
    assert(
      capturedRequestBody?.messages?.[0]?.content?.includes("primaryCandidateIndex"),
      "system prompt should explicitly request the primary candidate index",
    );
    console.log("✓ religion module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testReligionModuleIsReachableAtRuntime();
  console.log("\nAll runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
