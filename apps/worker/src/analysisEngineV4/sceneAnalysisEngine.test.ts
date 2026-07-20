/**
 * Regression tests for the V4 scene analysis graph.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/sceneAnalysisEngine.test.ts
 */
import { strict as assert } from "node:assert";

import { createSceneAnalysisEngine, createNormalizeSceneStateNode, createSceneAnalysisState } from "./index.js";

function testNodeUpdatesAreImmutable(): void {
  const initial = createSceneAnalysisState({
    sceneId: "scene-immutable",
    sceneText: "حاضر. فهد يتمتم: يا كلب",
  });

  const normalize = createNormalizeSceneStateNode();
  const normalized = normalize(initial);

  assert.notEqual(normalized, initial);
  assert.equal(initial.normalizedSceneText, "");
  assert.equal(normalized.normalizedSceneText, "حاضر. فهد يتمتم: يا كلب");
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(initial.trace.length, 0);
  assert.equal(normalized.trace.length, 0);
}

async function testGraphProducesTraceAndEvidenceFirstState(): Promise<void> {
  const engine = createSceneAnalysisEngine();
  const initialText = "حاضر. فهد يتمتم: يا كلب";
  const result = await engine.run("scene-trace", initialText);

  assert.equal(result.status, "complete");
  assert.equal(result.trace.length, 11);
  assert.equal(result.sentences.length > 0, true);
  assert.equal(result.evidenceSpans.length > 0, true);
  assert.equal(result.primaryEvidenceText?.includes("يا كلب"), true);
  assert.equal(result.explanation?.groundedEvidence?.includes("يا كلب"), true);
  assert.equal(result.detectedConcepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(result.knowledgeDomains.includes("profanity"), true);
  assert.equal(result.candidateArticles.length > 0, true);
  assert.equal(result.rankedCandidateArticles.length > 0, true);
  assert.equal(result.primaryArticle?.articleId, 4);
  assert.equal(result.candidateAtoms.length > 0, true);
  assert.equal(result.rankedCandidateAtoms.length > 0, true);
  assert.equal(result.sceneModel !== null, true);
  assert.equal(result.trace[0]?.node, "understand_scene");
  assert.equal(result.trace[0]?.changedKeys.includes("sceneModel"), true);
  assert.equal(result.trace[1]?.node, "candidate_evidence");
  assert.equal(result.trace[1]?.changedKeys.includes("evidenceSpanCount"), true);
  assert.equal(result.trace[2]?.node, "concept_classification");
  assert.equal(result.trace[2]?.changedKeys.includes("detectedConceptIds"), true);
  assert.equal(result.trace[8]?.node, "explanation");
  assert.equal(result.trace[8]?.changedKeys.includes("explanationSummary"), true);
  assert.equal(result.trace[9]?.node, "quality_judge");
  assert.equal(result.trace[9]?.changedKeys.includes("qualityJudgmentStatus"), true);
  assert.equal(result.trace.at(-1)?.node, "finalize");
  assert.equal(result.trace.some((entry) => entry.changedKeys.length > 0), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(initialText, "حاضر. فهد يتمتم: يا كلب");
}

async function testDisabledEngineReturnsInitialState(): Promise<void> {
  const engine = createSceneAnalysisEngine({ enabled: false });
  const result = await engine.run("scene-disabled", "كس امة");

  assert.equal(result.sceneId, "scene-disabled");
  assert.equal(result.sceneText, "كس امة");
  assert.equal(result.status, "pending");
  assert.equal(result.trace.length, 0);
  assert.equal(result.normalizedSceneText, "");
}

async function main(): Promise<void> {
  testNodeUpdatesAreImmutable();
  await testGraphProducesTraceAndEvidenceFirstState();
  await testDisabledEngineReturnsInitialState();
  console.log("\nAll V4 scene analysis graph tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
