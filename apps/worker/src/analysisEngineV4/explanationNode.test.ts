/**
 * Regression tests for the V4 ExplanationNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/explanationNode.test.ts
 */
import { strict as assert } from "node:assert";

import { getPolicyArticle } from "../policyMap.js";
import {
  createExplanationNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisArticleCandidate,
  type SceneAnalysisConcept,
  type SceneAnalysisEvidenceSpan,
  type SceneModel,
} from "./index.js";

function buildEvidenceSpan(text: string): SceneAnalysisEvidenceSpan {
  const pageReferences = Object.freeze([
    Object.freeze({
      pageNumber: 1,
      startOffsetPage: 0,
      endOffsetPage: text.length,
    }),
  ]);
  return Object.freeze({
    id: "evidence-1",
    spanId: "evidence-1",
    sceneId: "scene-explanation",
    eventId: "evidence-1",
    speaker: "فهد",
    target: null,
    page: 1,
    scene: "Scene focused on profanity evidence.",
    byteStartOffset: 0,
    byteEndOffset: text.length,
    rawText: text,
    normalizedText: text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    text,
    startOffset: 0,
    endOffset: text.length,
    lineId: "line-1",
    sentenceIndex: 0,
    sourceType: "Dialogue",
    pageReferences,
    conceptIds: Object.freeze(["profanity"]),
    confidence: 1,
    rationale: Object.freeze(["Grounded evidence span selected for explanation."]),
    grounding: Object.freeze({
      sentenceId: "evidence-1",
      lineId: "line-1",
      page: 1,
      startOffset: 0,
      endOffset: text.length,
      byteStartOffset: 0,
      byteEndOffset: text.length,
      matchedText: text,
      method: "exact" as const,
      pageReferences,
    }),
  });
}

function buildConcept(): SceneAnalysisConcept {
  return Object.freeze({
    conceptId: "profanity",
    label: "Profanity",
    knowledgeDomains: Object.freeze(["profanity"]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    confidence: 0.99,
    rationale: Object.freeze(["The evidence contains a profanity concept."]),
  });
}

function buildArticle(): SceneAnalysisArticleCandidate {
  const policyArticle = getPolicyArticle(4);
  return Object.freeze({
    articleId: 4,
    titleAr: policyArticle?.title_ar ?? "الألفاظ النابية",
    matchedKnowledgeDomains: Object.freeze(["profanity"]),
    matchedConceptIds: Object.freeze(["profanity"]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    score: 999,
    rationale: Object.freeze(["Academy mapping resolved this article from the concept."]),
  });
}

function buildSceneModel(summary: string): SceneModel {
  return Object.freeze({
    sceneId: "scene-explanation",
    rawSceneText: "يا كلب",
    normalizedSceneText: "يا كلب",
    heading: Object.freeze({
      raw: "INT. HOUSE - NIGHT",
      sceneType: "interior",
      location: "HOUSE",
      timeOfDay: "NIGHT",
    }),
    lines: Object.freeze([]),
    sentences: Object.freeze([]),
    dialogueLines: Object.freeze([]),
    actionLines: Object.freeze([]),
    characters: Object.freeze([]),
    summary,
  });
}

function testExplanationIsEvidenceFirst(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-explanation-a",
      sceneText: "يا كلب",
    }),
    sceneModel: buildSceneModel("Invented character سعيد appears in scene 2."),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence for explanation",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalPrimaryArticle: buildArticle(),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    primaryArticle: buildArticle(),
  });

  const next = createExplanationNode()(state);
  const explanation = next.explanation;

  assert.ok(explanation);
  assert.equal(explanation?.groundedEvidence, "يا كلب");
  assert.equal(explanation?.primaryArticleId, 4);
  assert.equal(explanation?.primaryArticleTitleAr, getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية");
  assert.equal(explanation?.summary.includes("يا كلب"), true);
  assert.equal(explanation?.summary.includes("Profanity"), true);
  assert.equal(explanation?.summary.includes(getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية"), true);
  assert.equal(explanation?.summary.includes("سعيد"), false);
  assert.equal(explanation?.summary.includes("scene 2"), false);
  assert.equal(explanation?.rationale.some((item) => item.includes("Evidence: يا كلب")), true);
  assert.equal(explanation?.rationale.some((item) => item.includes("Concept: Profanity (profanity)")), true);
  assert.equal(explanation?.rationale.some((item) => item.includes("Article: 4")), true);
  assert.equal(explanation?.rationale.some((item) => item.includes("Invented character سعيد")), false);
}

function testExplanationDoesNotLeakOtherSceneDetails(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-explanation-b",
      sceneText: "يا كلب",
    }),
    sceneModel: buildSceneModel("Another scene with character مريم and a fake chase."),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence for explanation",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalPrimaryArticle: buildArticle(),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    primaryArticle: buildArticle(),
  });

  const next = createExplanationNode()(state);
  const explanation = next.explanation;

  assert.ok(explanation);
  assert.equal(explanation?.rationale.join(" ").includes("مريم"), false);
  assert.equal(explanation?.rationale.join(" ").includes("fake chase"), false);
  assert.equal(explanation?.summary.includes("مريم"), false);
  assert.equal(explanation?.summary.includes("fake chase"), false);
}

function main(): void {
  testExplanationIsEvidenceFirst();
  testExplanationDoesNotLeakOtherSceneDetails();
  console.log("\nAll V4 ExplanationNode tests passed.");
}

main();
