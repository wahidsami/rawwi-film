import { strict as assert } from "node:assert";

import { runEvidenceStage } from "./evidenceStage.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";

function makeChunk(text: string): V3PipelineChunk {
  return Object.freeze({
    text,
    startOffset: 0,
    endOffset: text.length,
    chunkIndex: 0,
    storyMemory: null,
    sceneMemory: null,
    neighboringSentences: [],
    metadata: Object.freeze({}),
  });
}

function testEvidenceStagePreservesSentenceBoundaries(): void {
  const text = "الاول نظيف. كس امة. الثالث تهديد واضح.";
  const evidence = runEvidenceStage(makeChunk(text));

  assert.equal(evidence.candidates.length, 3);
  assert.equal(evidence.candidates[0]?.text, "الاول نظيف.");
  assert.equal(evidence.candidates[1]?.text, "كس امة.");
  assert.equal(evidence.candidates[2]?.text, "الثالث تهديد واضح.");
  assert.equal(evidence.primaryCandidateIndex, 1);
  assert.equal(evidence.candidates[1]?.startOffset, "الاول نظيف. ".length);
  assert.equal(evidence.candidates[1]?.endOffset, "الاول نظيف. كس امة.".length);
}

function main(): void {
  testEvidenceStagePreservesSentenceBoundaries();
  console.log("✓ evidence stage preserves sentence boundaries and primary sentence selection");
  console.log("\nAll evidence stage tests passed.");
}

main();
