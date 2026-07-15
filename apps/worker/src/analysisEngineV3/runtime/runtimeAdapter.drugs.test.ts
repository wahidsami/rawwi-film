/**
 * Smoke test for the V3 runtime adapter routing to the drugs module.
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
      sceneType: "street scene",
      narrativeIntent: "drug",
      storyPosition: "escalation",
      relationship: "dealer",
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
          text: "يبيع المخدرات للزبائن",
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
      semanticMeaning: "Drug trafficking scene",
      narrativeIntent: "drug",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "The scene is hostile.",
      sceneMemory: "Street corner.",
      localContext: "يبيع المخدرات للزبائن",
      chunkContext: "Chunk context",
      neighboringSentences: ["بعدها غادر المكان."],
      narrativeContext: "Direct drug trafficking dialogue.",
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

async function testDrugsModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-drugs-1",
      chunkId: "chunk-drugs-1",
      scriptId: "script-drugs-1",
      versionId: "version-drugs-1",
      chunkText: "يبيع المخدرات للزبائن",
      chunkStart: 0,
      chunkEnd: "يبيع المخدرات للزبائن".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["بعدها غادر المكان."],
      analysisPromptContext: "Drug content should route through the drugs module.",
      promptLexiconTerms: [
        {
          term: "مخدرات",
          gcam_article_id: 10,
          severity_floor: "medium",
          gcam_article_title_ar: "المخدرات",
          term_variants: ["مخدر"],
          description: "Drug anchor.",
          example_usage: "يبيع المخدرات",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_12_drugs",
        titleAr: "إطار المخدرات",
        scope: "Drug reasoning",
        rules: ["Detect drug content and context."],
        exclusions: ["Ignore medical and educational context."],
        requiredEvidence: ["Literal or implied drug evidence."],
        decisionTree: ["Is there drug content?", "Is the context blocking?"],
        examples: ["Direct trafficking in dialogue."],
        nonExamples: ["Educational mention."],
        articleIds: [10],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_12_drugs");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_12_drugs");
    assert.equal(result.findings.length > 0, true, "drugs module should be reachable at runtime");
    console.log("✓ drugs module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testDrugsModuleIsReachableAtRuntime();
  console.log("\nAll drugs runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
