/**
 * Regression tests for the V4 deterministic legal mapping engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/legal/legalMapping.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createCandidateEvidenceNode,
  createConceptClassificationNode,
  createInterpretSceneNode,
  createLegalMappingNode,
  createSceneAnalysisState,
  createSceneUnderstandingNode,
} from "../index.js";

async function buildMappedState(sceneId: string, sceneText: string) {
  const understood = createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId, sceneText }));
  const interpreted = await createInterpretSceneNode()(understood);
  const evidential = createCandidateEvidenceNode()(interpreted);
  const conceptual = createConceptClassificationNode()(evidential);
  return conceptual;
}

async function testSingleArticleLegalMapping(): Promise<void> {
  const state = await buildMappedState("scene-legal-1", "فهد: يا كلب");
  const next = createLegalMappingNode()(state);

  const collection = next.legalDecisionCollection;
  assert.ok(collection);
  assert.equal(collection.decisions.length > 0, true);
  assert.equal(collection.primaryArticle?.articleId, 4);
  assert.deepEqual(collection.candidateArticles.map((article) => article.articleId), [4, 5, 17]);
  assert.deepEqual(collection.secondaryArticles.map((article) => article.articleId), [5, 17]);
  assert.equal(collection.knowledgeSource.startsWith("academy:"), true);
}

async function testMultipleArticleLegalMapping(): Promise<void> {
  const state = await buildMappedState("scene-legal-2", "الرسول في المسجد. يا كلب");
  const next = createLegalMappingNode()(state);

  const collection = next.legalDecisionCollection;
  assert.ok(collection);
  assert.equal(collection.decisions.length > 0, true);
  assert.equal(collection.candidateArticles.length > 1, true);
  assert.equal(collection.primaryArticle?.articleId != null, true);
  assert.equal(collection.rankedCandidateArticles.length, collection.candidateArticles.length);
}

async function testLegalMappingIsDeterministic(): Promise<void> {
  const state = await buildMappedState("scene-legal-3", "فهد: يا كلب");
  const node = createLegalMappingNode();
  const left = node(state);
  const right = node(state);

  assert.deepEqual(left.legalDecisionCollection, right.legalDecisionCollection);
  assert.deepEqual(left.candidateArticles, right.candidateArticles);
  assert.deepEqual(left.primaryArticle, right.primaryArticle);
}

async function main(): Promise<void> {
  await testSingleArticleLegalMapping();
  await testMultipleArticleLegalMapping();
  await testLegalMappingIsDeterministic();
  console.log("\nAll V4 LegalMapping tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
