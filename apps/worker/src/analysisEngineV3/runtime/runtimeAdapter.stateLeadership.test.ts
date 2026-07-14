/**
 * Smoke tests for the V3 runtime adapter with the state leadership module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.stateLeadership.test.ts
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Character A",
      listener: "government",
      target: "government",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "promotion",
      storyPosition: "escalation",
      relationship: "adversary",
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
          text: "اسقطوا الحكومة",
          startOffset: 4,
          endOffset: 4 + "اسقطوا الحكومة".length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "اسقطوا الحكومة",
      narrativeIntent: "promotion",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "government",
      target: "government",
      victim: "government",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "The scene is political.",
      sceneMemory: "Interior confrontation.",
      localContext: "اسقطوا الحكومة",
      chunkContext: "Chunk context",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      narrativeContext: "Direct political dialogue about overthrow.",
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

async function testStateLeadershipModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-state-leadership-1",
      chunkId: "chunk-state-leadership-1",
      scriptId: "script-state-leadership-1",
      versionId: "version-state-leadership-1",
      chunkText: "اسقطوا الحكومة",
      chunkStart: 0,
      chunkEnd: "اسقطوا الحكومة".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      analysisPromptContext: "Political content should route through the state leadership module.",
      promptLexiconTerms: [
        {
          term: "الحكومة",
          gcam_article_id: 14,
          severity_floor: "low",
          gcam_article_title_ar: "التحريض على قلب نظام الحكم أو الدعوة إلى العنف",
          term_variants: ["الدولة"],
          description: "Political anchor.",
          example_usage: "اسقطوا الحكومة",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_02_state_leadership",
        titleAr: "شؤون القيادة السياسية الأساسية",
        scope: "State leadership analysis.",
        rules: ["Identify direct political incitement or disrespect."],
        exclusions: ["Ignore neutral political discussion."],
        requiredEvidence: ["Literal state leadership harm or incitement."],
        decisionTree: ["Is there state leadership context?", "Is there disrespect or incitement?"],
        examples: ["Direct overthrow call."],
        nonExamples: ["Educational mention."],
        articleIds: [14],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    const gcamMapping = result.truthLayerMeta.gcam_mapping as { status?: string };
    assert.equal(result.diagnostics.subjectModuleId, "v3_02_state_leadership");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_02_state_leadership");
    assert.equal(result.findings.length > 0, true, "state leadership module should be reachable at runtime");
    assert.equal(gcamMapping.status, "MAPPED");
    console.log("✓ state leadership module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testStateLeadershipModuleIsReachableAtRuntime();
  console.log("\nAll state leadership runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

