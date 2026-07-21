/**
 * Regression tests for the V4 ConceptClassificationNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/conceptClassificationNode.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createConceptClassificationNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisEvidenceSpan,
} from "./index.js";

function buildEvidenceSpan(input: Readonly<{
  spanId: string;
  text: string;
  startOffset: number;
  endOffset: number;
}>): SceneAnalysisEvidenceSpan {
  const pageReferences = Object.freeze([
    Object.freeze({
      pageNumber: 1,
      startOffsetPage: input.startOffset,
      endOffsetPage: input.endOffset,
    }),
  ]);
  return Object.freeze({
    id: input.spanId,
    spanId: input.spanId,
    sceneId: "scene-concepts",
    eventId: input.spanId,
    speaker: "فهد",
    target: "الجارة",
    page: 1,
    scene: "Scene contains profanity and a reaction.",
    byteStartOffset: input.startOffset,
    byteEndOffset: input.endOffset,
    rawText: input.text,
    normalizedText: input.text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    text: input.text,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    lineId: input.spanId,
    sentenceIndex: 0,
    sourceType: "Dialogue",
    pageReferences,
    conceptIds: Object.freeze([]),
    confidence: 1,
    rationale: Object.freeze(["Seed evidence span for deterministic concept classification."]),
    grounding: Object.freeze({
      sentenceId: input.spanId,
      lineId: input.spanId,
      page: 1,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      byteStartOffset: input.startOffset,
      byteEndOffset: input.endOffset,
      matchedText: input.text,
      method: "exact" as const,
      pageReferences,
    }),
  });
}

function testConceptClassificationUsesOneEvidenceSpanOnly(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-concepts",
      sceneText: "يا كلب. الله أكبر.",
    }),
    evidenceSpans: Object.freeze([
      buildEvidenceSpan({ spanId: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 }),
      buildEvidenceSpan({ spanId: "evidence-2", text: "الله أكبر", startOffset: 8, endOffset: 17 }),
    ]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "يا كلب",
    primaryEvidenceReason: "primary evidence for classification",
  });

  const node = createConceptClassificationNode();
  const next = node(state);

  assert.equal(next.detectedConcepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(next.detectedConcepts.some((concept) => concept.conceptId === "religion"), false);
  assert.equal(next.evidenceSpans.find((span) => span.spanId === "evidence-1")?.conceptIds.includes("profanity"), true);
  assert.equal(next.evidenceSpans.find((span) => span.spanId === "evidence-2")?.conceptIds.length, 0);
  assert.equal(next.evidenceSpans.find((span) => span.spanId === "evidence-1")?.rationale.some((item) => item.includes("What happened: يا كلب")), true);
}

function testConceptClassificationIsDeterministicForIdenticalEvidence(): void {
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({
      sceneId: "scene-concepts-a",
      sceneText: "سأقتلك",
    }),
    evidenceSpans: Object.freeze([
      buildEvidenceSpan({ spanId: "evidence-1", text: "سأقتلك", startOffset: 0, endOffset: 6 }),
    ]),
    primaryEvidenceSpanId: "evidence-1",
    primaryEvidenceText: "سأقتلك",
    primaryEvidenceReason: "primary evidence for classification",
  });

  const node = createConceptClassificationNode();
  const left = node(state);
  const right = node(state);

  assert.deepEqual(left.detectedConcepts, right.detectedConcepts);
  assert.deepEqual(left.evidenceSpans, right.evidenceSpans);
  assert.equal(left.detectedConcepts.some((concept) => concept.conceptId === "threat" || concept.conceptId === "violence"), true);
}

function main(): void {
  testConceptClassificationUsesOneEvidenceSpanOnly();
  testConceptClassificationIsDeterministicForIdenticalEvidence();
  console.log("\nAll V4 ConceptClassificationNode tests passed.");
}

main();
