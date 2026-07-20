/**
 * Regression tests for the V4 CandidateEvidenceNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/candidateEvidenceNode.test.ts
 */
import { strict as assert } from "node:assert";

import { createCandidateEvidenceNode, createSceneAnalysisState, createSceneUnderstandingNode } from "./index.js";

function testCandidateEvidenceCopiesVerbatimSpans(): void {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const understood = createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId: "scene-evidence", sceneText }));
  const evidenceState = createCandidateEvidenceNode()(understood);

  assert.equal(evidenceState.evidenceSpans.length, 2);
  for (const span of evidenceState.evidenceSpans) {
    const sourceSlice = sceneText.slice(span.startOffset, span.endOffset).trim();
    assert.equal(sourceSlice, span.text);
    assert.equal(sceneText.includes(span.text), true);
    assert.equal(span.pageReferences.length > 0, true);
    assert.equal(span.pageReferences[0]?.pageNumber, 1);
    assert.equal(span.pageReferences[0]?.startOffsetPage, span.startOffset);
    assert.equal(span.pageReferences[0]?.endOffsetPage, span.endOffset);
  }

  assert.equal(evidenceState.evidenceSpans[0]?.text, "فهد: يا كلب");
  assert.equal(evidenceState.evidenceSpans[1]?.text, "الجارة تغلق الباب.");
}

function testCandidateEvidenceIsDeterministicForIdenticalScenes(): void {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const left = createCandidateEvidenceNode()(createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId: "scene-a", sceneText })));
  const right = createCandidateEvidenceNode()(createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId: "scene-b", sceneText })));

  assert.equal(left.evidenceSpans.length, right.evidenceSpans.length);
  assert.deepEqual(left.evidenceSpans, right.evidenceSpans);
}

function main(): void {
  testCandidateEvidenceCopiesVerbatimSpans();
  testCandidateEvidenceIsDeterministicForIdenticalScenes();
  console.log("\nAll V4 CandidateEvidenceNode tests passed.");
}

main();

