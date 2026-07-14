/**
 * Smoke tests for the V3 runtime adapter with the violence module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.violence.test.ts
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "fight scene",
      narrativeIntent: "threat",
      storyPosition: "conflict",
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
          text: "طعن الرجل بسكين",
          startOffset: 0,
          endOffset: "طعن الرجل بسكين".length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "طعن الرجل بسكين",
      narrativeIntent: "threat",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "A hostile confrontation.",
      sceneMemory: "Street fight.",
      localContext: "طعن الرجل بسكين",
      chunkContext: "Chunk context",
      neighboringSentences: ["بدأ الشجار.", "ثم وقع الاعتداء."],
      narrativeContext: "Direct violence in dialogue.",
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
              content: buildMockOpenAIResponse(),
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
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function testViolenceModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-violence-1",
      chunkId: "chunk-violence-1",
      scriptId: "script-violence-1",
      versionId: "version-violence-1",
      chunkText: "سأقتلك إن اقتربت",
      chunkStart: 0,
      chunkEnd: "سأقتلك إن اقتربت".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["بدأ الشجار.", "ثم وقع الاعتداء."],
      analysisPromptContext: "Violence content should route through the violence module.",
      promptLexiconTerms: [
        {
          term: "عنف",
          gcam_article_id: 9,
          severity_floor: "high",
          gcam_article_title_ar: "العنف",
          term_variants: ["violence", "violent"],
          description: "Violence anchor.",
          example_usage: "سأقتلك إن اقتربت",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_08_violence",
        titleAr: "العنف",
        scope: "Violence analysis.",
        rules: ["Identify violence events, threats, attempts, self-defense, and justified force."],
        exclusions: ["Ignore neutral educational mention."],
        requiredEvidence: ["Literal violence or a clearly recoverable violence context."],
        decisionTree: ["Is there violence?", "Does context negate the literal reading?"],
        examples: ["Direct violence in dialogue."],
        nonExamples: ["Educational mention of violence."],
        articleIds: [9, 12, 14, 17],
        notes: ["Runtime adapter smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_08_violence");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_08_violence");
    assert.equal(result.findings.length > 0, true, "violence module should be reachable at runtime");
    console.log("✓ violence module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testViolenceModuleIsReachableAtRuntime();
  console.log("\nAll violence runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
