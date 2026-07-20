/**
 * Regression tests for the V4 LegalMappingNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/legalMappingNode.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createLegalMappingNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisConcept,
} from "./index.js";

function buildConcept(input: Readonly<{
  conceptId: string;
  label: string;
  knowledgeDomains: readonly string[];
}>): SceneAnalysisConcept {
  return Object.freeze({
    conceptId: input.conceptId,
    label: input.label,
    knowledgeDomains: Object.freeze([...input.knowledgeDomains]),
    evidenceSpanIds: Object.freeze([]),
    confidence: 0.95,
    rationale: Object.freeze([`Seed concept ${input.label} for deterministic legal mapping.`]),
  });
}

function testExactAcademyMappingForProfanity(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-legal-profanity",
      sceneText: "",
    }),
    detectedConcepts: Object.freeze([buildConcept({
      conceptId: "profanity",
      label: "Profanity",
      knowledgeDomains: ["profanity"],
    })]),
    knowledgeDomains: Object.freeze(["profanity"]),
  });

  const next = createLegalMappingNode()(state);

  assert.equal(next.sceneText, "");
  assert.equal(next.legalPrimaryArticle?.articleId, 4);
  assert.deepEqual(next.legalSecondaryArticles.map((article) => article.articleId), [5, 17]);
  assert.deepEqual(next.legalSupportingArticles.map((article) => article.articleId), []);
  assert.deepEqual(next.legalCandidateArticles.map((article) => article.articleId), [4, 5, 17]);
  assert.equal(next.legalCandidateArticles[0]?.titleAr.length > 0, true);
}

function testAcademyDomainMappingForReligion(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-legal-religion",
      sceneText: "",
    }),
    detectedConcepts: Object.freeze([buildConcept({
      conceptId: "religion",
      label: "Religion",
      knowledgeDomains: ["religion"],
    })]),
    knowledgeDomains: Object.freeze(["religion"]),
  });

  const next = createLegalMappingNode()(state);

  assert.equal(next.legalPrimaryArticle?.articleId, 1);
  assert.deepEqual(next.legalSecondaryArticles.map((article) => article.articleId), [2, 3]);
  assert.deepEqual(next.legalSupportingArticles.map((article) => article.articleId), []);
  assert.deepEqual(next.legalCandidateArticles.map((article) => article.articleId), [1, 2, 3]);
}

function testLegalMappingIsDeterministicForIdenticalInput(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-legal-deterministic",
      sceneText: "",
    }),
    detectedConcepts: Object.freeze([buildConcept({
      conceptId: "profanity",
      label: "Profanity",
      knowledgeDomains: ["profanity"],
    })]),
    knowledgeDomains: Object.freeze(["profanity"]),
  });

  const node = createLegalMappingNode();
  const left = node(state);
  const right = node(state);

  assert.deepEqual(left.legalCandidateArticles, right.legalCandidateArticles);
  assert.deepEqual(left.legalSecondaryArticles, right.legalSecondaryArticles);
  assert.deepEqual(left.legalSupportingArticles, right.legalSupportingArticles);
  assert.equal(left.legalPrimaryArticle?.articleId, right.legalPrimaryArticle?.articleId);
}

function main(): void {
  testExactAcademyMappingForProfanity();
  testAcademyDomainMappingForReligion();
  testLegalMappingIsDeterministicForIdenticalInput();
  console.log("\nAll V4 LegalMappingNode tests passed.");
}

main();
