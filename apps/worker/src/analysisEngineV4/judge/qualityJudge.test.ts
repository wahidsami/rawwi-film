/**
 * Regression tests for the V4 Quality Judge.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/judge/qualityJudge.test.ts
 */
import { strict as assert } from "node:assert";

import { getPolicyArticle } from "../../policyMap.js";
import { createVerifiedFindingCollectionFromState } from "./qualityJudgeEngine.js";
import {
  createQualityJudgeNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisArticleCandidate,
  type SceneAnalysisConcept,
  type SceneAnalysisEvidenceSpan,
  type SceneAnalysisExplanation,
  type SceneAnalysisExplanationCollection,
  type SceneAnalysisLegalDecisionCollection,
  type SceneModel,
} from "../index.js";

function buildEvidenceSpan(text: string): SceneAnalysisEvidenceSpan {
  const pageReferences = Object.freeze([
    Object.freeze({ pageNumber: 1, startOffsetPage: 0, endOffsetPage: text.length }),
  ]);
  return Object.freeze({
    id: "evidence-1",
    spanId: "evidence-1",
    sceneId: "scene-quality",
    eventId: "evidence-1",
    speaker: null,
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

function buildConcept(label = "Profanity", conceptId = "profanity"): SceneAnalysisConcept {
  return Object.freeze({
    conceptId,
    label,
    knowledgeDomains: Object.freeze([conceptId]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    confidence: 0.99,
    rationale: Object.freeze([`Semantic ${label.toLowerCase()} concept`]),
  });
}

function buildArticle(articleId = 4, titleAr = getPolicyArticle(4)?.title_ar ?? "الألفاظ النابية"): SceneAnalysisArticleCandidate {
  return Object.freeze({
    articleId,
    titleAr,
    matchedKnowledgeDomains: Object.freeze(["profanity"]),
    matchedConceptIds: Object.freeze(["profanity"]),
    evidenceSpanIds: Object.freeze(["evidence-1"]),
    score: 999,
    rationale: Object.freeze(["Academy mapping"]),
  });
}

function buildLegalDecisionCollection(article: SceneAnalysisArticleCandidate): SceneAnalysisLegalDecisionCollection {
  const decision = Object.freeze({
    id: "decision-1",
    conceptId: "profanity",
    candidateArticles: Object.freeze([article]),
    primaryArticle: article,
    secondaryArticles: Object.freeze([]),
    mappingReason: "Academy mapping",
    mappingConfidence: 0.99,
    knowledgeSource: "academy",
  });

  return Object.freeze({
    sceneId: "scene-quality",
    conceptIds: Object.freeze(["profanity"]),
    decisions: Object.freeze([decision]),
    candidateArticles: Object.freeze([article]),
    rankedCandidateArticles: Object.freeze([article]),
    primaryArticle: article,
    secondaryArticles: Object.freeze([]),
    supportingArticles: Object.freeze([]),
    knowledgeSource: "academy",
    confidence: 0.99,
    executionTimeMs: 0,
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

function buildExplanationCollection(explanations: readonly SceneAnalysisExplanation[]): SceneAnalysisExplanationCollection {
  const records = explanations.map((explanation, index) => Object.freeze({
    id: `explanation-${index + 1}`,
    legalDecisionId: "decision-1",
    conceptId: "profanity",
    evidenceId: "evidence-1",
    title: explanation.primaryArticleTitleAr ?? "Legacy explanation",
    summary: explanation.summary,
    reasoning: Object.freeze([...explanation.rationale]),
    recommendedAction: "Requires Verification" as const,
    confidence: 0.9,
  }));

  return Object.freeze({
    sceneId: "scene-quality",
    explanations: Object.freeze(records),
    primaryExplanationId: records[0]?.id ?? null,
    primaryExplanation: records[0] ?? null,
    prompt: "",
    response: JSON.stringify({ explanations: records }, null, 2),
    validationResult: Object.freeze({ status: "pass" as const, rejectedReasons: Object.freeze([]) }),
    confidence: 0.9,
    executionTimeMs: 0,
  });
}

function testQualityJudgeProducesVerifiedFindingCollection(): void {
  const evidence = buildEvidenceSpan("يا كلب");
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-pass", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([evidence]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalDecisionCollection: buildLegalDecisionCollection(buildArticle()),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: buildExplanation(),
    explanationCollection: buildExplanationCollection([buildExplanation()]),
  });

  const verified = createVerifiedFindingCollectionFromState(state);
  const judged = createQualityJudgeNode()(state);

  assert.equal(verified.report.overallStatus, "pass");
  assert.equal(verified.primaryVerifiedFindingId, verified.primaryVerifiedFinding?.findingId ?? null);
  assert.equal(verified.primaryVerifiedFinding?.evidenceId, evidence.id);
  assert.equal(verified.verifiedFindings[0]?.evidenceId, evidence.id);
  assert.equal(judged.qualityJudgment?.status, "pass");
  assert.equal(judged.verifiedFindingCollection?.report.overallStatus, "pass");
  assert.equal(judged.verifiedFindingCollection?.verifiedFindings.length, 1);
  assert.equal(judged.verifiedFindingCollection?.verifiedFindings[0]?.evidenceId, evidence.id);
}

function testQualityJudgeRejectsMissingEvidence(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-missing-evidence", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([]),
    primaryEvidenceSpanId: null,
    primaryEvidenceText: null,
    primaryEvidenceReason: null,
    detectedConcepts: Object.freeze([buildConcept()]),
    legalDecisionCollection: buildLegalDecisionCollection(buildArticle()),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: buildExplanation({ groundedEvidence: "يا كلب" }),
    explanationCollection: buildExplanationCollection([buildExplanation({ groundedEvidence: "يا كلب" })]),
  });

  const verified = createVerifiedFindingCollectionFromState(state);

  assert.equal(verified.report.overallStatus, "reject");
  assert.equal(verified.report.rejectionReasons.length > 0, true);
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
    legalDecisionCollection: buildLegalDecisionCollection(buildArticle()),
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
    explanationCollection: buildExplanationCollection([
      buildExplanation({
        summary: 'Grounded evidence "يا كلب" expresses Profanity, but character مريم later appears in scene 2.',
        rationale: Object.freeze([
          "Evidence: يا كلب",
          "Concept: Profanity (profanity)",
          "Article: 4 (الألفاظ النابية)",
          "Reason: The grounded evidence expresses Profanity, but another scene introduces مريم.",
          "Scene summary reviewed for scene-local context only.",
        ]),
      }),
    ]),
  });

  const verified = createVerifiedFindingCollectionFromState(state);
  const judged = createQualityJudgeNode()(state);

  assert.equal(verified.report.overallStatus, "reject");
  assert.equal(verified.report.rejectionReasons.length > 0, true);
  assert.equal(judged.qualityJudgment?.status, "reject");
  assert.equal(judged.status, "failed");
}

function testDuplicateFindingsAreMergedDeterministically(): void {
  const sharedExplanation = buildExplanation();
  const explanationCollection = buildExplanationCollection([
    sharedExplanation,
    Object.freeze({
      ...sharedExplanation,
      summary: `${sharedExplanation.summary} Duplicate candidate.`,
    }),
  ]);

  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-duplicate", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalDecisionCollection: buildLegalDecisionCollection(buildArticle()),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: sharedExplanation,
    explanationCollection,
  });

  const verified = createVerifiedFindingCollectionFromState(state);

  assert.equal(verified.verifiedFindings.length, 1);
  assert.equal(verified.report.duplicateMergedCount, 1);
  assert.equal(verified.report.overallStatus, "needs_review");
}

function testQualityJudgeIsDeterministic(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-quality-deterministic", sceneText: "يا كلب" }),
    sceneModel: buildSceneModel("Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).", ["فهد"]),
    evidenceSpans: Object.freeze([buildEvidenceSpan("يا كلب")]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence",
    detectedConcepts: Object.freeze([buildConcept()]),
    legalDecisionCollection: buildLegalDecisionCollection(buildArticle()),
    legalCandidateArticles: Object.freeze([buildArticle()]),
    legalPrimaryArticle: buildArticle(),
    primaryArticle: buildArticle(),
    explanation: buildExplanation(),
    explanationCollection: buildExplanationCollection([buildExplanation()]),
  });

  const first = createVerifiedFindingCollectionFromState(state);
  const second = createVerifiedFindingCollectionFromState(state);

  const normalize = (value: typeof first) => ({
    ...value,
    executionTimeMs: 0,
  });

  assert.deepStrictEqual(normalize(first), normalize(second));
  assert.equal(JSON.stringify(normalize(first)), JSON.stringify(normalize(second)));
}

function main(): void {
  testQualityJudgeProducesVerifiedFindingCollection();
  console.log("✓ judge produces a verified finding collection");
  testQualityJudgeRejectsMissingEvidence();
  console.log("✓ judge rejects missing evidence");
  testQualityJudgeRejectsHallucination();
  console.log("✓ judge rejects hallucinated explanations");
  testDuplicateFindingsAreMergedDeterministically();
  console.log("✓ judge merges duplicate findings deterministically");
  testQualityJudgeIsDeterministic();
  console.log("✓ judge is deterministic");
  console.log("\nAll V4 Quality Judge tests passed.");
}

main();
