/**
 * Smoke test for the V3 runtime adapter routing to the society module.
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
      sceneType: "school scene",
      narrativeIntent: "society",
      storyPosition: "escalation",
      relationship: "classmate",
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
          text: "هذا تنمر على الطالب أمام الجميع",
          startOffset: 4,
          endOffset: 32,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "Bullying scene",
      narrativeIntent: "society",
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
      sceneMemory: "School hallway.",
      localContext: "هذا تنمر على الطالب أمام الجميع",
      chunkContext: "Chunk context",
      neighboringSentences: ["بعدها تدخل المعلم."],
      narrativeContext: "Direct bullying dialogue.",
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

async function testSocietyModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-society-1",
      chunkId: "chunk-society-1",
      scriptId: "script-society-1",
      versionId: "version-society-1",
      chunkText: "هذا تنمر على الطالب أمام الجميع",
      chunkStart: 0,
      chunkEnd: "هذا تنمر على الطالب أمام الجميع".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["بعدها تدخل المعلم."],
      analysisPromptContext: "Society content should route through the society module.",
      promptLexiconTerms: [
        {
          term: "تنمر",
          gcam_article_id: 17,
          severity_floor: "medium",
          gcam_article_title_ar: "التمييز والتنمر",
          term_variants: ["تنمّر"],
          description: "Bullying anchor.",
          example_usage: "هذا تنمر",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_05_society",
        titleAr: "إساءة المجتمع أو الهوية الوطنية",
        scope: "Society and identity reasoning",
        rules: ["Detect society, identity and discrimination content."],
        exclusions: ["Ignore educational and documentary contexts."],
        requiredEvidence: ["Literal or implied society evidence."],
        decisionTree: ["Is there society content?", "Is the context blocking?"],
        examples: ["Direct bullying in dialogue."],
        nonExamples: ["Educational mention."],
        articleIds: [4, 8, 12, 17, 18],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_05_society");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_05_society");
    assert.equal(result.findings.length > 0, true, "society module should be reachable at runtime");
    console.log("✓ society module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testSocietyModuleIsReachableAtRuntime();
  console.log("\nAll society runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
