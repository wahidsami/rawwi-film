/**
 * Smoke tests for the V3 runtime adapter with the children module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.children.test.ts
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
      narrativeIntent: "abuse",
      storyPosition: "escalation",
      relationship: "caretaker",
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
          text: "يضرب الطفل بقسوة",
          startOffset: 4,
          endOffset: 4 + "يضرب الطفل بقسوة".length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "يضرب الطفل بقسوة",
      narrativeIntent: "abuse",
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
      storyMemory: "The scene concerns a child being harmed.",
      sceneMemory: "Interior confrontation.",
      localContext: "يضرب الطفل بقسوة",
      chunkContext: "Chunk context",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها ساد الصمت."],
      narrativeContext: "Direct child abuse in dialogue.",
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

async function testChildrenModuleIsReachableAtRuntime(): Promise<void> {
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
      jobId: "job-children-1",
      chunkId: "chunk-children-1",
      scriptId: "script-children-1",
      versionId: "version-children-1",
      chunkText: "يضرب الطفل بقسوة",
      chunkStart: 0,
      chunkEnd: "يضرب الطفل بقسوة".length,
      chunkIndex: 0,
      startLine: 1,
      endLine: 1,
      storyMemory: "Story memory is present.",
      sceneMemory: "Scene memory is present.",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها ساد الصمت."],
      analysisPromptContext: "Children content should route through the children module.",
      promptLexiconTerms: [
        {
          term: "طفل",
          gcam_article_id: 6,
          severity_floor: "high",
          gcam_article_title_ar: "حماية الطفل",
          term_variants: ["قاصر", "minor"],
          description: "Protected child anchor.",
          example_usage: "يضرب الطفل بقسوة",
        },
      ],
    };

    const result = await runV3RuntimeAdapter(request, {
      subjectModule: {
        id: "v3_05_children",
        titleAr: "إيذاء الطفل وذوي الإعاقة",
        scope: "Children analysis.",
        rules: ["Identify abuse, neglect, exploitation, grooming, violence, and psychological abuse against children."],
        exclusions: ["Ignore neutral educational mention."],
        requiredEvidence: ["Literal child harm or vulnerable-person harm."],
        decisionTree: ["Is there child harm?", "Does context negate the literal reading?"],
        examples: ["Direct abuse of a child."],
        nonExamples: ["Educational mention of child safety."],
        articleIds: [5, 6, 17],
        notes: ["Runtime adapter smoke test subject module."],
      },
      responseFormat: "json_object",
    });

    const gcamMapping = result.truthLayerMeta.gcam_mapping as { status?: string; articleId?: number | null };
    assert.equal(result.diagnostics.subjectModuleId, "v3_05_children");
    assert.equal(result.truthLayerMeta.subject_module_id, "v3_05_children");
    assert.equal(result.findings.length > 0, true, "children module should be reachable at runtime");
    assert.equal(gcamMapping.status, "MAPPED");
    assert.equal(gcamMapping.articleId, 6);
    console.log("✓ children module reachable through runtime adapter");
  } finally {
    await endpoint.close();
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
    process.env.SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseServiceRoleKey;
  }
}

async function main(): Promise<void> {
  await testChildrenModuleIsReachableAtRuntime();
  console.log("\nAll children runtime adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

