/**
 * Tests for the V3 travel legal module.
 */
import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { TRAVEL_EXAMPLES } from "./travelExamples.js";
import { TRAVEL_MODULE, isTravelEvidenceText } from "./travelModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: TRAVEL_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "travel scene",
      narrativeIntent: "observation",
      storyPosition: "setup",
      relationship: "neutral",
      emotionalTone: "neutral",
      condemnation: false,
      approval: false,
      neutrality: true,
      historicalContext: false,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.96,
    },
    evidence: createLegalEvidenceResult({
      candidates: [{ text, startOffset: 0, endOffset: text.length, confidence: 0.99, source: "chunk" }],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    }),
    semantic: {
      semanticMeaning: text,
      narrativeIntent: "observation",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "neutral",
      riskContext: "low",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد سفر",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك حديث عن الرحلة."],
      narrativeContext: "Travel dialogue.",
      confidence: 0.95,
    }),
    glossary: { title: "Test glossary", entries: [], notes: [] },
  };
}

function makeInput(text: string, overrides?: Partial<IntelligenceBuilderInput>): LegalModuleEvaluationInput {
  const base = makeBaseInput(text);
  return {
    moduleId: TRAVEL_MODULE.id,
    intelligence: buildIntelligenceContext({
      ...base,
      ...overrides,
      evidence: overrides?.evidence ?? base.evidence,
      narrative: overrides?.narrative ?? base.narrative,
      semantic: overrides?.semantic ?? base.semantic,
      context: overrides?.context ?? base.context,
      glossary: overrides?.glossary ?? base.glossary,
      storyMemory: overrides?.storyMemory ?? base.storyMemory,
    }),
  };
}

function evaluate(input: LegalModuleEvaluationInput) {
  const registry = new LegalModuleRegistry().register(TRAVEL_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(TRAVEL_MODULE);
  assert.equal(registry.load(TRAVEL_MODULE.id)?.id, TRAVEL_MODULE.id);
  assert.equal(isTravelEvidenceText("سافر إلى الهند"), true);
  assert.equal(isTravelEvidenceText("جلسوا يتحدثون عن الجريمة"), false);
  assert.ok(TRAVEL_EXAMPLES.positive.length > 0);
  assert.ok(TRAVEL_EXAMPLES.negative.length > 0);
  console.log("✓ travel module registry and helpers");
}

function testDirectCountryEvaluation(): void {
  const decision = evaluate(makeInput("هذه الدولة لا تستحق الاحترام"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(4), true);
  console.log("✓ direct country evaluation");
}

function testTravelObservationNeedsReview(): void {
  const decision = evaluate(makeInput("سافر إلى الهند هذا المساء"));
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(11), true);
  console.log("✓ travel observation");
}

function testDocumentaryTravelRejected(): void {
  const decision = evaluate(
    makeInput("الوثائقي يشرح كيف غادر البلد", {
      narrative: {
        speaker: null,
        listener: null,
        target: null,
        narrativeVoice: "narration",
        sceneType: "documentary",
        narrativeIntent: "reporting",
        storyPosition: "background",
        relationship: null,
        emotionalTone: "neutral",
        condemnation: false,
        approval: false,
        neutrality: true,
        historicalContext: false,
        dream: false,
        flashback: false,
        comedy: false,
        satire: false,
        threat: false,
        instruction: false,
        news: false,
        documentary: true,
        dialogue: false,
        narration: true,
        sceneDescription: true,
        confidence: 0.9,
      },
      semantic: {
        semanticMeaning: "Documentary travel explanation.",
        narrativeIntent: "reporting",
        conversationRole: "narrator",
        sceneRole: "documentary",
        speaker: null,
        listener: null,
        target: null,
        victim: null,
        emotion: "neutral",
        riskContext: "low",
        confidence: 0.9,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is informational.",
        sceneMemory: "Archive footage.",
        localContext: "الوثائقي يشرح كيف غادر البلد",
        chunkContext: "Chunk 1",
        neighboringSentences: ["ثم تظهر لقطات أرشيفية."],
        narrativeContext: "Documentary travel context.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ documentary travel rejected");
}

function main(): void {
  testRegistryAndHelpers();
  testDirectCountryEvaluation();
  testTravelObservationNeedsReview();
  testDocumentaryTravelRejected();
  console.log("\nAll travel module tests passed.");
}

main();
