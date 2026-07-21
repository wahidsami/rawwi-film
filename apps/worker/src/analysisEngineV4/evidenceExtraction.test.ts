/**
 * Regression tests for the V4 Evidence Extraction node.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/evidenceExtraction.test.ts
 */
import { strict as assert } from "node:assert";

import {
  createEvidenceExtractionNode,
  createSceneAnalysisState,
  createSceneUnderstandingNode,
  freezeSceneAnalysisState,
  type SemanticSceneModel,
} from "./index.js";

function buildSemanticSceneModel(input: Readonly<{
  summary: string;
  participants: readonly string[];
  events: readonly Readonly<{
    eventType: string;
    description: string;
    evidence: string;
    participants: readonly string[];
  }>[];
  relationships?: readonly Readonly<{
    subject: string;
    relation: string;
    object: string;
    evidence: string | null;
  }>[];
  timeline?: readonly Readonly<{
    order: number;
    description: string;
    evidence: string | null;
  }>[];
}>): SemanticSceneModel {
  return Object.freeze({
    summary: input.summary,
    participants: Object.freeze([...input.participants]),
    relationships: Object.freeze((input.relationships ?? []).map((relationship) => Object.freeze({ ...relationship }))),
    events: Object.freeze(input.events.map((event) => Object.freeze({ ...event }))),
    timeline: Object.freeze((input.timeline ?? []).map((entry) => Object.freeze({ ...entry }))),
    speakerIntent: "conversational",
    emotionalState: "neutral",
    victims: Object.freeze([]),
    aggressors: Object.freeze([]),
    targets: Object.freeze([]),
    sensitiveConcepts: Object.freeze([]),
    scenePurpose: "observation",
    sceneOutcome: "static",
    confidence: 0.9,
  });
}

function runEvidenceExtraction(sceneId: string, sceneText: string, semanticSceneModel: SemanticSceneModel) {
  const understood = createSceneUnderstandingNode()(createSceneAnalysisState({ sceneId, sceneText }));
  const prepared = freezeSceneAnalysisState({
    ...understood,
    semanticSceneModel,
  });
  return createEvidenceExtractionNode()(prepared);
}

function testSmallestGroundedSpanExtraction(): void {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const state = runEvidenceExtraction(
    "scene-smallest-span",
    sceneText,
    buildSemanticSceneModel({
      summary: "Scene contains a direct insult in dialogue.",
      participants: ["فهد", "الجارة"],
      events: [
        {
          eventType: "Insult",
          description: "فهد: يا كلب",
          evidence: "فهد: يا كلب",
          participants: ["فهد", "الجارة"],
        },
      ],
    }),
  );

  const evidence = state.evidenceCollection?.evidence[0];
  assert.ok(evidence);
  const groundedEvidence = evidence as NonNullable<typeof evidence>;
  assert.equal(groundedEvidence.rawText, "يا كلب");
  assert.equal(sceneText.slice(groundedEvidence.startOffset, groundedEvidence.endOffset), "يا كلب");
  assert.equal(groundedEvidence.page, 1);
  assert.equal(groundedEvidence.pageReferences[0]?.pageNumber, 1);
  assert.equal(groundedEvidence.pageReferences[0]?.startOffsetPage, groundedEvidence.startOffset);
  assert.equal(groundedEvidence.pageReferences[0]?.endOffsetPage, groundedEvidence.endOffset);
}

function testSourceTypeExtraction(): void {
  const cases = [
    {
      sceneId: "dialogue",
      sceneText: "فهد: يا كلب",
      eventType: "Insult",
      evidence: "فهد: يا كلب",
      expectedSourceType: "Dialogue" as const,
    },
    {
      sceneId: "action",
      sceneText: "يدفع سامي بقوة",
      eventType: "Physical Abuse",
      evidence: "يدفع سامي بقوة",
      expectedSourceType: "Action" as const,
    },
    {
      sceneId: "narration",
      sceneText: "يشرح ما حدث",
      eventType: "Narration",
      evidence: "يشرح ما حدث",
      expectedSourceType: "Narration" as const,
    },
    {
      sceneId: "document",
      sceneText: "تقرير الشرطة يثبت الحادث",
      eventType: "Document",
      evidence: "تقرير الشرطة يثبت الحادث",
      expectedSourceType: "Document" as const,
    },
    {
      sceneId: "screen",
      sceneText: "على الشاشة يظهر العنوان",
      eventType: "Screen",
      evidence: "على الشاشة يظهر العنوان",
      expectedSourceType: "Screen" as const,
    },
  ];

  for (const testCase of cases) {
    const state = runEvidenceExtraction(
      testCase.sceneId,
      testCase.sceneText,
      buildSemanticSceneModel({
        summary: `Scene for ${testCase.sceneId}.`,
        participants: ["فهد", "سامي"],
        events: [
          {
            eventType: testCase.eventType,
            description: testCase.evidence,
            evidence: testCase.evidence,
            participants: ["فهد", "سامي"],
          },
        ],
      }),
    );
    const evidence = state.evidenceCollection?.evidence[0];
    assert.ok(evidence);
    const groundedEvidence = evidence as NonNullable<typeof evidence>;
    assert.equal(groundedEvidence.sourceType, testCase.expectedSourceType);
    assert.equal((groundedEvidence.rawText?.length ?? 0) > 0, true);
    assert.equal(testCase.sceneText.includes(groundedEvidence.rawText ?? ""), true);
  }
}

function testOffsetCorrectness(): void {
  const sceneText = "فهد: يا كلب";
  const state = runEvidenceExtraction(
    "scene-offsets",
    sceneText,
    buildSemanticSceneModel({
      summary: "Offset test scene.",
      participants: ["فهد"],
      events: [
        {
          eventType: "Insult",
          description: "فهد: يا كلب",
          evidence: "فهد: يا كلب",
          participants: ["فهد"],
        },
      ],
    }),
  );

  const evidence = state.evidenceCollection?.evidence[0];
  assert.ok(evidence);
  const groundedEvidence = evidence as NonNullable<typeof evidence>;
  assert.equal(sceneText.slice(groundedEvidence.startOffset, groundedEvidence.endOffset), groundedEvidence.rawText);
  assert.equal(sceneText.slice(groundedEvidence.startOffset, groundedEvidence.endOffset), "يا كلب");
  assert.equal((groundedEvidence.byteStartOffset ?? 0) <= (groundedEvidence.byteEndOffset ?? 0), true);
}

function testDuplicateEvidenceMerge(): void {
  const sceneText = "فهد: يا كلب\nفهد: يا كلب";
  const state = runEvidenceExtraction(
    "scene-duplicates",
    sceneText,
    buildSemanticSceneModel({
      summary: "Duplicate evidence scene.",
      participants: ["فهد"],
      events: [
        {
          eventType: "Insult",
          description: "فهد: يا كلب",
          evidence: "فهد: يا كلب",
          participants: ["فهد"],
        },
        {
          eventType: "Insult",
          description: "فهد: يا كلب",
          evidence: "فهد: يا كلب",
          participants: ["فهد"],
        },
      ],
    }),
  );

  assert.equal(state.evidenceCollection?.evidence.length, 1);
  assert.equal(state.evidenceCollection?.dedupDecisions.length, 1);
  assert.equal(state.evidenceCollection?.dedupDecisions[0]?.matchedBy, "normalized_text");
}

function testDeterminism(): void {
  const semanticSceneModel = buildSemanticSceneModel({
    summary: "Deterministic evidence scene.",
    participants: ["فهد"],
    events: [
      {
        eventType: "Insult",
        description: "فهد: يا كلب",
        evidence: "فهد: يا كلب",
        participants: ["فهد"],
      },
    ],
  });
  const left = runEvidenceExtraction("scene-deterministic-a", "فهد: يا كلب", semanticSceneModel);
  const right = runEvidenceExtraction("scene-deterministic-b", "فهد: يا كلب", semanticSceneModel);

  const stripSceneId = <T extends Readonly<{ sceneId?: string | null }>>(value: T) => {
    const { sceneId: _sceneId, ...rest } = value as Readonly<Record<string, unknown>>;
    return rest;
  };
  const normalizeCollection = (collection: NonNullable<typeof left.evidenceCollection>) => ({
    ...collection,
    sceneId: "normalized",
    executionTimeMs: 0,
    evidence: collection.evidence.map((evidence) => stripSceneId(evidence)),
  });

  assert.deepStrictEqual(normalizeCollection(left.evidenceCollection as NonNullable<typeof left.evidenceCollection>), normalizeCollection(right.evidenceCollection as NonNullable<typeof right.evidenceCollection>));
  assert.deepStrictEqual(left.evidenceSpans.map((evidence) => stripSceneId(evidence)), right.evidenceSpans.map((evidence) => stripSceneId(evidence)));
}

function main(): void {
  testSmallestGroundedSpanExtraction();
  testSourceTypeExtraction();
  testOffsetCorrectness();
  testDuplicateEvidenceMerge();
  testDeterminism();
  console.log("\nAll V4 EvidenceExtraction tests passed.");
}

main();
