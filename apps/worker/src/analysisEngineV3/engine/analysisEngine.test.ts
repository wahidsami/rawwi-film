/**
 * Tests for the V3 unified analysis engine entry point.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/engine/analysisEngine.test.ts
 */
import { strict as assert } from "node:assert";
import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { createAnalysisFactory } from "./analysisFactory.js";
import { hashForDiagnostics } from "./analysisDiagnostics.js";
import { toPromptBuilderInput, type AnalysisRequest } from "./analysisRequest.js";

function makeRequest(): AnalysisRequest {
  return {
    chunk: {
      text: "A: damn, that plan failed.",
      startOffset: 120,
      endOffset: 146,
      chunkIndex: 4,
    },
    storyMemory: "The conflict escalates after the failed plan.",
    sceneMemory: "Interior, late night, the team argues in a control room.",
    neighboringSentences: ["Before: the plan looked promising.", "After: everyone fell silent."],
    glossary: {
      title: "Glossary Context",
      entries: [
        { term: "damn", articleId: 4, variants: ["damned"], definition: "Direct profanity term." },
      ],
      notes: ["Glossary is knowledge, not classification."],
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      rules: ["Identify literal profanity in the chunk."],
      exclusions: ["Do not classify neutral quotations."],
      requiredEvidence: ["Literal profanity present in the chunk."],
      decisionTree: ["Is there literal profanity?", "Does context negate the literal reading?"],
      examples: ["A direct profanity in dialogue."],
      nonExamples: ["Educational mention of a profanity term."],
      articleIds: [4, 5, 17],
      notes: ["Reference module for the V3 unified engine tests."],
    },
    outputSchema: {
      title: "Analysis Response",
      fields: [
        { name: "promptHash", description: "Rendered prompt hash", required: true },
        { name: "stageHashes", description: "Per-stage hashes", required: true },
        { name: "stageTimings", description: "Per-stage timings", required: true },
      ],
      notes: ["Render the JSON contract exactly once."],
      example: {
        promptHash: "sha256",
        stageHashes: [],
        stageTimings: [],
      },
    },
    config: {
      diagnostics: { enabled: false },
    },
  };
}

function cloneRequest(request: AnalysisRequest): AnalysisRequest {
  return JSON.parse(JSON.stringify(request)) as AnalysisRequest;
}

function testIdenticalRequestsProduceIdenticalResponses(): void {
  const factory = createAnalysisFactory();
  const request = makeRequest();
  const first = factory.analyze(request);
  const second = factory.analyze(cloneRequest(request));

  assert.deepStrictEqual(first, second);
  console.log("✓ identical requests produce identical responses");
}

function testPromptHashPropagatesCorrectly(): void {
  const factory = createAnalysisFactory();
  const request = makeRequest();
  const response = factory.analyze(request);
  const promptInput = toPromptBuilderInput(request, {
    reasoningContract: factory.config.reasoningContract,
    decisionGraph: factory.config.decisionGraph,
    semanticLayer: factory.config.semanticLayer,
  });
  const renderedPrompt = buildV3RenderedPrompt(promptInput);

  assert.equal(response.promptHash, renderedPrompt.promptHash);
  assert.equal(response.diagnostics.promptHash, renderedPrompt.promptHash);
  console.log("✓ prompt hash propagates correctly");
}

function testStageHashesPropagateCorrectly(): void {
  const factory = createAnalysisFactory();
  const response = factory.analyze(makeRequest());

  assert.deepStrictEqual(response.stageHashes, response.diagnostics.stageHashes);
  assert.equal(response.stageHashes.length, 6);
  assert.equal(response.stageTimings.length, 6);
  console.log("✓ stage hashes propagate correctly");
}

function testDiagnosticsPopulatedCorrectly(): void {
  const factory = createAnalysisFactory();
  const response = factory.analyze(makeRequest());

  assert.deepStrictEqual(response.diagnostics.executionOrder, [
    "build_prompt",
    "reasoning_pipeline",
    "semantic_layer",
    "intelligence_layer",
    "legal_engine",
    "module_evaluation",
    "analysis_response",
  ]);
  assert.equal(response.semanticHash, response.diagnostics.semanticHash);
  assert.equal(response.legalHash, response.diagnostics.legalHash);
  assert.equal(response.semanticHash, hashForDiagnostics(response.semantic));
  assert.equal(response.legalHash, hashForDiagnostics(response.legalDecision));
  assert(response.diagnostics.stageTimings.every((stage) => stage.durationMs === null), "diagnostic timings should be null when diagnostics are disabled");
  console.log("✓ diagnostics are populated correctly");
}

async function main(): Promise<void> {
  testIdenticalRequestsProduceIdenticalResponses();
  testPromptHashPropagatesCorrectly();
  testStageHashesPropagateCorrectly();
  testDiagnosticsPopulatedCorrectly();
  console.log("\nAll V3 unified analysis engine tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
