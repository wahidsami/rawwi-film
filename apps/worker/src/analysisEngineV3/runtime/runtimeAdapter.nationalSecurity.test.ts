/**
 * Smoke tests for the V3 runtime adapter with the national security module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.nationalSecurity.test.ts
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Character A",
      listener: "military",
      target: "military",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "disclosure",
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
          text: "سربوا الأسرار العسكرية",
          startOffset: 4,
          endOffset: 4 + "سربوا الأسرار العسكرية".length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "سربوا الأسرار العسكرية",
      narrativeIntent: "disclosure",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "military",
      target: "military",
      victim: "military",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "The scene concerns secret disclosures.",
      sceneMemory: "Interior confrontation.",
      localContext: "سربوا الأسرار العسكرية",
      chunkContext: "Chunk context",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      narrativeContext: "Direct disclosure of secret military information.",
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

async function testNationalSecurityModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-national-security-1",
      chunkId: "chunk-national-security-1",
      scriptId: "script-national-security-1",
      versionId: "version-national-security-1",
      chunkText: "سربوا الأسرار العسكرية",
      chunkStart: 0,
      chunkEnd: "سربوا الأسرار العسكرية".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها ساد الصمت."],
      analysisPromptContext: "National security content should route through the national security module.",
      promptLexiconTerms: [
        {
          term: "الأسرار العسكرية",
          gcam_article_id: 21,
          severity_floor: "high",
          gcam_article_title_ar: "الوثائق والمعلومات السرية",
          term_variants: ["سر عسكري", "معلومة سرية"],
          description: "Protected security anchor.",
          example_usage: "سربوا الأسرار العسكرية",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_03_national_security",
        titleAr: "الأمن الوطني",
        scope: "National security analysis.",
        rules: ["Identify terrorism, recruitment, sabotage, riots, cyber attacks, and military disclosure."],
        exclusions: ["Ignore neutral educational mention."],
        requiredEvidence: ["Literal national security harm or disclosure."],
        decisionTree: ["Is there national security context?", "Is there harmful security conduct?"],
        examples: ["Direct leak of military secrets."],
        nonExamples: ["Educational mention of security policy."],
        articleIds: [12, 14, 15, 21],
        notes: ["Runtime adapter smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    const gcamMapping = result.truthLayerMeta.gcam_mapping as { status?: string; articleId?: number | null };
    assert.equal(result.diagnostics.subjectModuleId, "v3_03_national_security");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_03_national_security");
    assert.equal(result.findings.length > 0, true, "national security module should be reachable at runtime");
    assert.equal(gcamMapping.status, "MAPPED");
    assert.equal(gcamMapping.articleId, 21);
    console.log("✓ national security module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testNationalSecurityModuleIsReachableAtRuntime();
  console.log("\nAll national security runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

