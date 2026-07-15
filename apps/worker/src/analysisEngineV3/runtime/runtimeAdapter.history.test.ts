/**
 * Smoke test for the V3 runtime adapter routing to the history module.
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Narrator",
      listener: "Audience",
      target: "Audience",
      narrativeVoice: "narration",
      sceneType: "history scene",
      narrativeIntent: "history",
      storyPosition: "setup",
      relationship: null,
      emotionalTone: "neutral",
      condemnation: false,
      approval: false,
      neutrality: true,
      historicalContext: true,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: true,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.97,
    },
    evidence: {
      candidates: [
        {
          text: "هذا وثائقي مزيف وادعاء تاريخي كاذب",
          startOffset: 0,
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
      semanticMeaning: "False historical documentary claim",
      narrativeIntent: "history",
      conversationRole: "speaker",
      sceneRole: "narration",
      speaker: "Narrator",
      listener: "Audience",
      target: "Audience",
      victim: "Audience",
      emotion: "neutral",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: {
      storyMemory: "Historical context is present.",
      sceneMemory: "Archive footage.",
      localContext: "هذا وثائقي مزيف وادعاء تاريخي كاذب",
      chunkContext: "Chunk context",
      neighboringSentences: ["ثم يظهر التصحيح لاحقًا."],
      narrativeContext: "Historical distortion.",
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

async function testHistoryModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-history-1",
      chunkId: "chunk-history-1",
      scriptId: "script-history-1",
      versionId: "version-history-1",
      chunkText: "هذا وثائقي مزيف وادعاء تاريخي كاذب",
      chunkStart: 0,
      chunkEnd: "هذا وثائقي مزيف وادعاء تاريخي كاذب".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["ثم يظهر التصحيح لاحقًا."],
      analysisPromptContext: "History accuracy content should route through the history module.",
      promptLexiconTerms: [
        {
          term: "التاريخ",
          gcam_article_id: 16,
          severity_floor: "medium",
          gcam_article_title_ar: "التاريخ",
          term_variants: ["الماضي"],
          description: "History anchor.",
          example_usage: "هذا وثائقي مزيف",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_04_history",
        titleAr: "الدقة التاريخية",
        scope: "History accuracy reasoning",
        rules: ["Detect fabricated history and misleading presentation."],
        exclusions: ["Ignore neutral historical discussion."],
        requiredEvidence: ["Literal or implied historical distortion."],
        decisionTree: ["Is there history content?", "Is the context blocking?"],
        examples: ["Direct false historical claim in narration."],
        nonExamples: ["Neutral archive reference."],
        articleIds: [16],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_04_history");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_04_history");
    assert.equal(result.findings.length > 0, true, "history module should be reachable at runtime");
    console.log("✓ history module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testHistoryModuleIsReachableAtRuntime();
  console.log("\nAll history runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
