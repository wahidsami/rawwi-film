/**
 * Regression tests for the V4 QualityJudgeNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/qualityJudgeNode.test.ts
 */
import { strict as assert } from "node:assert";

import { getPolicyArticle } from "../policyMap.js";
import {
  createQualityJudgeNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisArticleCandidate,
  type SceneAnalysisConcept,
  type SceneAnalysisEvidenceSpan,
  type SceneAnalysisExplanation,
  type SceneModel,
} from "./index.js";

function buildEvidenceSpan(text: string): SceneAnalysisEvidenceSpan {
  const pageReferences = Object.freeze([
    Object.freeze({ pageNumber: 1, startOffsetPage: 0, endOffsetPage: text.length }),
  ]);
  return Object.freeze({
    id: "evidence-1",
    spanId: "evidence-1",
    sceneId: "scene-quality",
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
    rationale: Object.freeze(["Grounded evidence"]),
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
    rationale: Object.freeze(["Semantic profanity concept"]),
  });
}

function buildArticle(): SceneAnalysisArticleCandidate {
  return Object.freeze({
    articleId: 4,
    titleAr: getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية",
    matchedKnowledgeDomains: Object.freeze(["profanity"]),
    matchedConceptIds: Object.freeze(["profanity"]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    score: 999,
    rationale: Object.freeze(["Academy mapping"]),
  });
}

function buildSceneModel(summary: string, characters: readonly string[]): SceneModel {
  return Object.freeze({
    sceneId: "scene-quality",
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
    characters: Object.freeze([...characters]),
    summary,
  });
}

function buildExplanation(overrides: Partial<SceneAnalysisExplanation> = {}): SceneAnalysisExplanation {
  return Object.freeze({
    summary: overrides.summary ?? 'Grounded evidence "يا كلب" expresses Profanity, so the Academy maps it to article 4 (الألفاظ النابية).',
    groundedEvidence: overrides.groundedEvidence ?? "يا كلب",
    primaryArticleId: overrides.primaryArticleId ?? 4,
    primaryArticleTitleAr: overrides.primaryArticleTitleAr ?? (getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية"),
    primaryAtomId: overrides.primaryAtomId ?? null,
    primaryAtomTitleAr: overrides.primaryAtomTitleAr ?? null,
    rationale: overrides.rationale ?? Object.freeze([
      "Evidence: يا كلب",
      "Concept: Profanity (profanity)",
      "Article: 4 (الألفاظ النابية)",
      "Reason: The grounded evidence expresses Profanity, and the Academy maps that concept to article 4.",
      "Scene summary reviewed for scene-local context only.",
    ]),
  });
}

function testQualityJudgePassesCleanExplanation(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-pass", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: buildExplanation(),
  });

  const next = createQualityJudgeNode()(state);

  assert.equal(next.qualityJudgment?.status, "pass");
  assert.equal(next.qualityJudgment?.quoteExists, true);
  assert.equal(next.qualityJudgment?.explanationReferencesQuote, true);
  assert.equal(next.qualityJudgment?.articleMatchesConcept, true);
  assert.equal(next.qualityJudgment?.explanationMentionsAnotherFinding, false);
  assert.equal(next.qualityJudgment?.explanationInventsFacts, false);
  assert.equal(next.qualityJudgment?.rejectionReasons.length, 0);
}

function testQualityJudgeRejectsHallucination(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-reject", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: buildExplanation({
      summary: 'Grounded evidence "يا كلب" expresses Profanity, but character مريم later appears in scene 2.',
      rationale: Object.freeze([
        "Evidence: يا كلب",
        "Concept: Profanity (profanity)",
        "Article: 4 (الألفاظ النابية)",
        "Reason: The grounded evidence expresses Profanity, but another scene introduces مريم.",
        "Scene summary reviewed for scene-local context only.",
      ]),
    }),
  });

  const next = createQualityJudgeNode()(state);

  assert.equal(next.qualityJudgment?.status, "reject");
  assert.equal(next.qualityJudgment?.quoteExists, true);
  assert.equal(next.qualityJudgment?.explanationReferencesQuote, true);
  assert.equal(next.qualityJudgment?.articleMatchesConcept, true);
  assert.equal(next.qualityJudgment?.explanationMentionsAnotherFinding, false);
  assert.equal(next.qualityJudgment?.explanationInventsFacts, true);
  assert.equal(next.qualityJudgment?.rejectionReasons.includes("hallucination_detected"), true);
  assert.equal(next.status, "failed");
}

function main(): void {
  testQualityJudgePassesCleanExplanation();
  testQualityJudgeRejectsHallucination();
  console.log("\nAll V4 QualityJudgeNode tests passed.");
}

main();
