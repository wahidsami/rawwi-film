/**
 * Regression tests for the V4 concept classification engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/concepts/conceptClassification.test.ts
 */
import { strict as assert } from "node:assert";

import { buildConceptCollection } from "./conceptBuilder.js";
import {
  classifyConceptCollection,
  createConceptClassificationNode,
} from "./conceptClassificationNode.js";
import { createSceneAnalysisState, freezeSceneAnalysisState, type SceneAnalysisEvidenceSpan, type SceneAnalysisEvidenceCollection } from "../sceneAnalysisState.js";

function buildEvidence(input: Readonly<{
  id: string;
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
    id: input.id,
    spanId: input.id,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    text: input.text,
    sceneId: "scene-concepts",
    eventId: input.id,
    speaker: "فهد",
    target: "الجارة",
    page: 1,
    scene: "Scene contains a short dialogue exchange.",
    byteStartOffset: input.startOffset,
    byteEndOffset: input.endOffset,
    rawText: input.text,
    normalizedText: input.text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    eventType: "dialogue",
    participants: Object.freeze(["فهد", "الجارة"]),
    confidence: 1,
    sourceType: "Dialogue",
    lineId: input.id,
    sentenceId: input.id,
    sentenceIndex: 0,
    pageReferences,
    conceptIds: Object.freeze([]),
    rationale: Object.freeze(["Seed evidence span for concept classification."]),
    grounding: Object.freeze({
      sentenceId: input.id,
      lineId: input.id,
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

function buildEvidenceCollection(evidence: readonly SceneAnalysisEvidenceSpan[]): SceneAnalysisEvidenceCollection {
  return Object.freeze({
    sceneId: "scene-concepts",
    evidence,
    primaryEvidenceId: evidence[0]?.id ?? null,
    dedupDecisions: Object.freeze([]),
    grounding: Object.freeze({
      totalCandidates: evidence.length,
      groundedCount: evidence.length,
      unmatchedCount: 0,
    }),
    executionTimeMs: 1,
  });
}

function stripTiming<T extends { executionTimeMs: number }>(collection: T): T {
  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
  });
}

function testSingleConcept(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 });
  const collection = buildEvidenceCollection(Object.freeze([evidence]));

  const concepts = buildConceptCollection(collection);

  assert.equal(concepts.concepts.some((concept: { conceptId: string }) => concept.conceptId === "profanity"), true);
  assert.equal(concepts.concepts.some((concept: { conceptId: string }) => concept.conceptId === "religion"), false);
  assert.equal(concepts.concepts[0]?.evidenceId, "evidence-1");
  assert.equal(concepts.concepts[0]?.reason.includes("Matched"), true);
}

function testMultipleConcepts(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "يا كلب يا حقير سأقتلك", startOffset: 0, endOffset: 21 });
  const collection = buildEvidenceCollection(Object.freeze([evidence]));

  const concepts = buildConceptCollection(collection);

  assert.equal(concepts.concepts.some((concept: { conceptId: string }) => concept.conceptId === "profanity"), true);
  assert.equal(concepts.concepts.some((concept: { conceptId: string }) => concept.conceptId === "insult"), true);
  assert.equal(concepts.concepts.some((concept: { conceptId: string }) => concept.conceptId === "threat"), true);
  assert.equal(concepts.concepts.length >= 3, true);
}

function testNoConcept(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "جلس في الغرفة بهدوء", startOffset: 0, endOffset: 18 });
  const collection = buildEvidenceCollection(Object.freeze([evidence]));

  const concepts = buildConceptCollection(collection);

  assert.equal(concepts.concepts.length, 0);
  assert.equal(concepts.dedupDecisions.length, 0);
}

function testDeduplication(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 });
  const duplicated = Object.freeze([
    evidence,
    Object.freeze({ ...evidence }),
  ]);
  const collection = buildEvidenceCollection(duplicated);

  const concepts = buildConceptCollection(collection);

  assert.equal(concepts.concepts.length, 1);
  assert.equal(concepts.dedupDecisions.length, 1);
}

function testDeterminism(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "سأقتلك", startOffset: 0, endOffset: 6 });
  const collection = buildEvidenceCollection(Object.freeze([evidence]));

  const left = stripTiming(buildConceptCollection(collection));
  const right = stripTiming(buildConceptCollection(collection));

  assert.deepEqual(left, right);
}

function testNodeLeavesEvidenceUntouched(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 });
  const evidenceCollection = buildEvidenceCollection(Object.freeze([evidence]));
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-concepts", sceneText: "يا كلب" }),
    evidenceCollection,
    evidenceSpans: Object.freeze([evidence]),
    primaryEvidenceSpanId: evidence.id,
    primaryEvidenceText: evidence.text,
    primaryEvidenceReason: "primary evidence for concept classification",
  });

  const node = createConceptClassificationNode();
  const next = node(state);

  assert.equal(next.conceptCollection?.concepts.some((concept: { conceptId: string }) => concept.conceptId === "profanity"), true);
  assert.equal(next.detectedConcepts.some((concept: { conceptId: string }) => concept.conceptId === "profanity"), true);
  assert.equal(next.evidenceSpans.find((span) => span.id === evidence.id)?.conceptIds.length, 0);
  assert.equal(next.evidenceSpans.find((span) => span.id === evidence.id)?.rationale.includes("Seed evidence span for concept classification."), true);
}

function testConceptCollectionIsStableThroughNode(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 });
  const evidenceCollection = buildEvidenceCollection(Object.freeze([evidence]));
  const state = freezeSceneAnalysisState({
    ...createSceneAnalysisState({ sceneId: "scene-concepts", sceneText: "يا كلب" }),
    evidenceCollection,
    evidenceSpans: Object.freeze([evidence]),
    primaryEvidenceSpanId: evidence.id,
    primaryEvidenceText: evidence.text,
    primaryEvidenceReason: "primary evidence for concept classification",
  });

  const node = createConceptClassificationNode();
  const left = node(state);
  const right = node(state);

  assert.deepEqual(stripTiming(left.conceptCollection as { executionTimeMs: number }), stripTiming(right.conceptCollection as { executionTimeMs: number }));
  assert.deepEqual(left.detectedConcepts, right.detectedConcepts);
}

function testConceptClassifierApi(): void {
  const evidence = buildEvidence({ id: "evidence-1", text: "سأقتلك", startOffset: 0, endOffset: 6 });
  const collection = buildEvidenceCollection(Object.freeze([evidence]));
  const classified = classifyConceptCollection({
    ...createSceneAnalysisState({ sceneId: "scene-concepts", sceneText: "سأقتلك" }),
    evidenceCollection: collection,
  });

  assert.equal(classified.conceptCollection.concepts.some((concept: { conceptId: string }) => concept.conceptId === "threat"), true);
  assert.equal(classified.detectedConcepts.some((concept: { conceptId: string }) => concept.conceptId === "threat"), true);
}

function main(): void {
  testSingleConcept();
  console.log("✓ single concept");
  testMultipleConcepts();
  console.log("✓ multiple concepts");
  testNoConcept();
  console.log("✓ no concept");
  testDeduplication();
  console.log("✓ deduplication");
  testDeterminism();
  console.log("✓ determinism");
  testNodeLeavesEvidenceUntouched();
  console.log("✓ node leaves evidence untouched");
  testConceptCollectionIsStableThroughNode();
  console.log("✓ node is stable for identical state");
  testConceptClassifierApi();
  console.log("✓ classifier API returns the shared concept contract");
  console.log("\nAll V4 ConceptClassification tests passed.");
}

main();
