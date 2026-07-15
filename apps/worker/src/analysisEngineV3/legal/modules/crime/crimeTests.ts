/**
 * Tests for the V3 crime legal module.
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
import { CRIME_EXAMPLES } from "./crimeExamples.js";
import { CRIME_MODULE, isCrimeEvidenceText } from "./crimeModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: CRIME_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "crime scene",
      narrativeIntent: "planning",
      storyPosition: "escalation",
      relationship: "adversary",
      emotionalTone: "hostile",
      condemnation: false,
      approval: false,
      neutrality: false,
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
      narrativeIntent: "planning",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد جنائي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها عم الصمت."],
      narrativeContext: "Direct crime dialogue.",
      confidence: 0.95,
    }),
    glossary: { title: "Test glossary", entries: [], notes: [] },
  };
}

function makeInput(text: string, overrides?: Partial<IntelligenceBuilderInput>): LegalModuleEvaluationInput {
  const base = makeBaseInput(text);
  return {
    moduleId: CRIME_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(CRIME_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(CRIME_MODULE);
  assert.equal(registry.load(CRIME_MODULE.id)?.id, CRIME_MODULE.id);
  assert.equal(isCrimeEvidenceText("سنسرق البنك الليلة"), true);
  assert.equal(isCrimeEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(CRIME_EXAMPLES.positive.length > 0);
  assert.ok(CRIME_EXAMPLES.negative.length > 0);
  console.log("✓ crime module registry and helpers");
}

function testDirectCrimePlanning(): void {
  const decision = evaluate(makeInput("سنسرق البنك الليلة ونغسل الأموال"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(13), true);
  console.log("✓ direct crime planning");
}

function testPoliceInvestigationNeedsReview(): void {
  const decision = evaluate(makeInput("الشرطة تحقق في قضية اختطاف جديدة", {
    narrative: {
      speaker: "Reporter",
      listener: null,
      target: null,
      narrativeVoice: "narration",
      sceneType: "police",
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
      news: true,
      documentary: false,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.9,
    },
    semantic: {
      semanticMeaning: "Police investigation of kidnapping.",
      narrativeIntent: "reporting",
      conversationRole: "narrator",
      sceneRole: "news",
      speaker: "Reporter",
      listener: null,
      target: null,
      victim: null,
      emotion: "neutral",
      riskContext: "medium",
      confidence: 0.9,
    },
    context: createLegalContextResult({
      storyMemory: "The scene is reporting.",
      sceneMemory: "Police station.",
      localContext: "الشرطة تحقق في قضية اختطاف جديدة",
      chunkContext: "Chunk 1",
      neighboringSentences: ["تحدثت الشرطة مع الشهود."],
      narrativeContext: "Police investigation context.",
      confidence: 0.9,
    }),
  }));
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(4), true);
  console.log("✓ police investigation context");
}

function testNeutralObservationRejected(): void {
  const decision = evaluate(makeInput("في الخبر ذُكر اعتقال مشتبه به في سرقة", {
    narrative: {
      speaker: null,
      listener: null,
      target: null,
      narrativeVoice: "narration",
      sceneType: "news",
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
      news: true,
      documentary: false,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.9,
    },
    semantic: {
      semanticMeaning: "Neutral crime report.",
      narrativeIntent: "reporting",
      conversationRole: "narrator",
      sceneRole: "news",
      speaker: null,
      listener: null,
      target: null,
      victim: null,
      emotion: "neutral",
      riskContext: "low",
      confidence: 0.9,
    },
    context: createLegalContextResult({
      storyMemory: "The scene is reporting.",
      sceneMemory: "News room.",
      localContext: "في الخبر ذُكر اعتقال مشتبه به في سرقة",
      chunkContext: "Chunk 1",
      neighboringSentences: ["تقرير إخباري فقط."],
      narrativeContext: "News report context.",
      confidence: 0.9,
    }),
  }));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ neutral observation rejected");
}

function main(): void {
  testRegistryAndHelpers();
  testDirectCrimePlanning();
  testPoliceInvestigationNeedsReview();
  testNeutralObservationRejected();
  console.log("\nAll crime module tests passed.");
}

main();
