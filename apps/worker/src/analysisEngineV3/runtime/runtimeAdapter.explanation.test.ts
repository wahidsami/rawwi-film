/**
 * Run: node --import tsx apps/worker/src/analysisEngineV3/runtime/runtimeAdapter.explanation.test.ts
 */
import { strict as assert } from "node:assert";

import type { AnalysisResponse } from "../engine/analysisResponse.js";
import { buildExplanationSafeAnalysisResponse } from "./explanationSafeAnalysisResponse.js";

function buildAnalysisResponse(): AnalysisResponse {
  return {
    promptHash: "prompt",
    semanticHash: "semantic",
    legalHash: "legal",
    stageHashes: [],
    stageTimings: [],
    narrative: {} as never,
    evidence: {} as never,
    semantic: {} as never,
    context: {
      storyMemory: "story memory",
      sceneMemory: "scene memory",
      localContext: "local context",
      chunkContext: "chunk context",
      neighboringSentences: [],
      narrativeContext: "narrative context",
      confidence: 0.9,
    } as never,
    intelligence: {
      storyMemory: "story memory",
    } as never,
    legalDecision: {} as never,
    diagnostics: {} as never,
  } as AnalysisResponse;
}

function main(): void {
  const original = buildAnalysisResponse();
  const redacted = buildExplanationSafeAnalysisResponse(original);

  assert.equal(redacted.context.storyMemory, null);
  assert.equal(redacted.context.sceneMemory, null);
  assert.equal(redacted.intelligence.storyMemory, null);
  assert.equal(original.context.storyMemory, "story memory");
  assert.equal(original.context.sceneMemory, "scene memory");
  assert.equal(original.intelligence.storyMemory, "story memory");

  console.log("✓ explanation boundary redacts story and scene memory");
}

main();
