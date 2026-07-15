/**
 * Smoke test for the V3 runtime adapter routing to the family values module.
 */
import { createServer } from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import type { V3RuntimeAdapterRequest } from "./runtimeTypes.js";

function buildMockOpenAIResponse(): string {
  const reasoning = {
    narrative: {
      speaker: "Parent",
      listener: "Child",
      target: "Child",
      narrativeVoice: "dialogue",
      sceneType: "family scene",
      narrativeIntent: "family_values",
      storyPosition: "escalation",
      relationship: "family",
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
          text: "هذا يدمّر العائلة ويهدم البيت",
          startOffset: 0,
          endOffset: 29,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "Family destruction scene",
      narrativeIntent: "family_values",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Parent",
      listener: "Child",
      target: "Child",
      victim: "Child",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: {
      storyMemory: "Family tension is escalating.",
      sceneMemory: "Inside the house.",
      localContext: "هذا يدمّر العائلة ويهدم البيت",
      chunkContext: "Chunk context",
      neighboringSentences: ["بعدها بدأ الصراخ."],
      narrativeContext: "Direct family harm.",
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

async function testFamilyValuesModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-family-values-1",
      chunkId: "chunk-family-values-1",
      scriptId: "script-family-values-1",
      versionId: "version-family-values-1",
      chunkText: "هذا يدمّر العائلة ويهدم البيت",
      chunkStart: 0,
      chunkEnd: "هذا يدمّر العائلة ويهدم البيت".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["بعدها بدأ الصراخ."],
      analysisPromptContext: "Family values content should route through the family values module.",
      promptLexiconTerms: [
        {
          term: "العائلة",
          gcam_article_id: 8,
          severity_floor: "medium",
          gcam_article_title_ar: "الأسرة والقيم الأسرية",
          term_variants: ["البيت"],
          description: "Family anchor.",
          example_usage: "هذا يدمّر العائلة",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_04_family_values",
        titleAr: "قيم الأسرة",
        scope: "Family values reasoning",
        rules: ["Detect family destruction, abuse, humiliation and neglect."],
        exclusions: ["Ignore educational and documentary contexts."],
        requiredEvidence: ["Literal or implied family harm."],
        decisionTree: ["Is there family content?", "Is the context blocking?"],
        examples: ["Direct family harm in dialogue."],
        nonExamples: ["Educational mention."],
        articleIds: [4, 8, 17, 18],
        notes: ["Runtime smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    assert.equal(result.diagnostics.subjectModuleId, "v3_04_family_values");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_04_family_values");
    assert.equal(result.findings.length > 0, true, "family values module should be reachable at runtime");
    console.log("✓ family values module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testFamilyValuesModuleIsReachableAtRuntime();
  console.log("\nAll family values runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
