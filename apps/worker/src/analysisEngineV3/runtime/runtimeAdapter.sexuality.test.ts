/**
 * Smoke test for the V3 runtime adapter routing to the sexuality module.
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "sexual",
      storyPosition: "escalation",
      relationship: "partner",
      emotionalTone: "intimate",
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
          text: "مشهد عارٍ صريح في غرفة النوم",
          startOffset: 4,
          endOffset: 31,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "Explicit sexual nudity scene",
      narrativeIntent: "sexual",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "intimate",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: {
      storyMemory: "The scene is intimate.",
      sceneMemory: "Interior bedroom.",
      localContext: "مشهد عارٍ صريح في غرفة النوم",
      chunkContext: "Chunk context",
      neighboringSentences: ["بعدها انتهى المشهد."],
      narrativeContext: "Direct sexual dialogue about nudity.",
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
  close: () => Promise<void>;
}> {
  const server = createServer((request, response) => {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end("method not allowed");
      return;
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

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseURL = `http://127.0.0.1:${address.port}/v1`;
  return {
    baseURL,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function testSexualityModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-sexuality-1",
      chunkId: "chunk-sexuality-1",
      scriptId: "script-sexuality-1",
      versionId: "version-sexuality-1",
      chunkText: "مشهد عارٍ صريح في غرفة النوم",
      chunkStart: 0,
      chunkEnd: "مشهد عارٍ صريح في غرفة النوم".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك تلميح.", "بعدها ساد الصمت."],
      analysisPromptContext: "Sexual content should route through the sexuality module.",
      promptLexiconTerms: [
        {
          term: "عري",
          gcam_article_id: 9,
          severity_floor: "medium",
          gcam_article_title_ar: "المحتوى الجنسي",
          term_variants: ["عارية"],
          description: "Sexual anchor.",
          example_usage: "مشهد عارٍ",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_07_sexuality",
        titleAr: "المحتوى الجنسي غير المناسب",
        scope: "Sexual content",
        rules: ["Detect sexual content and nudity."],
        exclusions: ["Ignore medical and educational context."],
        requiredEvidence: ["Literal or implied sexual evidence."],
        decisionTree: ["Is there sexual content?", "Is the context blocking?"],
        examples: ["Direct nudity in dialogue."],
        nonExamples: ["Educational mention."],
        articleIds: [5, 6, 7, 9, 17],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_07_sexuality");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_07_sexuality");
    assert.equal(result.findings.length > 0, true, "sexuality module should be reachable at runtime");
    console.log("✓ sexuality module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testSexualityModuleIsReachableAtRuntime();
  console.log("\nAll sexuality runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
