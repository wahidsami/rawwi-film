/**
 * Backward-compatible smoke tests for the V4 ConceptClassificationNode wrapper.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/conceptClassificationNode.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createConceptClassificationNode,
  createSceneAnalysisState,
  freezeSceneAnalysisState,
  type SceneAnalysisEvidenceSpan,
  type SceneAnalysisEvidenceCollection,
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

function testWrapperLeavesEvidenceUntouched(): void {
  const evidence = buildEvidenceSpan({ spanId: "evidence-1", text: "يا كلب", startOffset: 0, endOffset: 6 });
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

  assert.equal(next.conceptCollection?.concepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(next.detectedConcepts.some((concept) => concept.conceptId === "profanity"), true);
  assert.equal(next.evidenceSpans.find((span) => span.id === evidence.id)?.conceptIds.length, 0);
}

function main(): void {
  testWrapperLeavesEvidenceUntouched();
  console.log("\nAll V4 ConceptClassificationNode wrapper tests passed.");
}

main();

