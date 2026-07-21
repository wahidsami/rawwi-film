/**
 * Regression tests for the V4 CandidateEvidenceNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/candidateEvidenceNode.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createCandidateEvidenceNode,
  createSceneAnalysisState,
  createSceneUnderstandingNode,
  freezeSceneAnalysisState,
  type SemanticSceneModel,
} from "./index.js";

function buildSemanticSceneModel(): SemanticSceneModel {
  return Object.freeze({
    summary: "Scene contains a direct insult in dialogue.",
    participants: Object.freeze(["فهد", "الجارة"]),
    relationships: Object.freeze([]),
    events: Object.freeze([
      Object.freeze({
        eventType: "Insult",
        description: "فهد: يا كلب",
        evidence: "فهد: يا كلب",
        participants: Object.freeze(["فهد", "الجارة"]),
      }),
      Object.freeze({
        eventType: "Action",
        description: "الجارة تغلق الباب.",
        evidence: "الجارة تغلق الباب.",
        participants: Object.freeze(["الجارة"]),
      }),
    ]),
    timeline: Object.freeze([]),
    speakerIntent: "conversational",
    emotionalState: "tense",
    victims: Object.freeze([]),
    aggressors: Object.freeze([]),
    targets: Object.freeze([]),
    sensitiveConcepts: Object.freeze(["profanity"]),
    scenePurpose: "conversation",
    sceneOutcome: "exchange_of_information",
    confidence: 0.9,
  });
}

function testCandidateEvidenceCopiesVerbatimSpans(): void {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const understood = createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId: "scene-evidence", sceneText }));
  const evidenceState = createCandidateEvidenceNode()(freezeSceneAnalysisState({
    ...understood,
    semanticSceneModel: buildSemanticSceneModel(),
  }));

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

  assert.equal(evidenceState.evidenceSpans[0]?.text, "يا كلب");
  assert.equal(evidenceState.evidenceSpans[1]?.text, "الجارة تغلق الباب.");
  assert.equal(evidenceState.evidenceCollection?.evidence.length, 2);
  assert.equal(evidenceState.evidenceCollection?.primaryEvidenceId, evidenceState.evidenceSpans[0]?.id ?? null);
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
