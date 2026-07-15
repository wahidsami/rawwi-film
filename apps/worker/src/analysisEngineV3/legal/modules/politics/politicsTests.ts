/**
 * Tests for the V3 politics legal module.
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
import { POLITICS_EXAMPLES } from "./politicsExamples.js";
import { POLITICS_MODULE, isPoliticsEvidenceText } from "./politicsModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: POLITICS_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "political scene",
      narrativeIntent: "direct",
      storyPosition: "escalation",
      relationship: "opponent",
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
      narrativeIntent: "direct",
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
      sceneMemory: "مشهد سياسي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك جدال.", "بعدها عم الصمت."],
      narrativeContext: "Direct political dialogue.",
      confidence: 0.95,
    }),
    glossary: { title: "Test glossary", entries: [], notes: [] },
  };
}

function makeInput(text: string, overrides?: Partial<IntelligenceBuilderInput>): LegalModuleEvaluationInput {
  const base = makeBaseInput(text);
  return {
    moduleId: POLITICS_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(POLITICS_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(POLITICS_MODULE);
  assert.equal(registry.load(POLITICS_MODULE.id)?.id, POLITICS_MODULE.id);
  assert.equal(isPoliticsEvidenceText("يجب إسقاط الحكومة"), true);
  assert.equal(isPoliticsEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(POLITICS_EXAMPLES.positive.length > 0);
  assert.ok(POLITICS_EXAMPLES.negative.length > 0);
  console.log("✓ politics module registry and helpers");
}

function testDirectPoliticalAttack(): void {
  const decision = evaluate(makeInput("يجب إسقاط الحكومة فورا"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(4), true);
  console.log("✓ direct political attack");
}

function testPoliticalReferenceNeedsReview(): void {
  const decision = evaluate(makeInput("قال: الحكومة ستعقد الاجتماع اليوم"));
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(8), true);
  console.log("✓ neutral political reference");
}

function testEducationalDiscussion(): void {
  const decision = evaluate(
    makeInput("في الدرس نشرح معنى الدستور والانتخابات", {
      narrative: {
        speaker: "Teacher",
        listener: "Students",
        target: null,
        narrativeVoice: "narration",
        sceneType: "instruction",
        narrativeIntent: "instruction",
        storyPosition: "setup",
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
        instruction: true,
        news: false,
        documentary: false,
        dialogue: false,
        narration: true,
        sceneDescription: true,
        confidence: 0.9,
      },
      semantic: {
        semanticMeaning: "Educational explanation of politics.",
        narrativeIntent: "instruction",
        conversationRole: "narrator",
        sceneRole: "educational",
        speaker: "Teacher",
        listener: null,
        target: null,
        victim: null,
        emotion: "neutral",
        riskContext: "low",
        confidence: 0.9,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is instructional.",
        sceneMemory: "Classroom.",
        localContext: "في الدرس نشرح معنى الدستور والانتخابات",
        chunkContext: "Chunk 1",
        neighboringSentences: ["قبلها كان هناك تمهيد.", "بعدها أمثلة تعليمية."],
        narrativeContext: "Educational lecture about politics.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational discussion");
}

function main(): void {
  testRegistryAndHelpers();
  testDirectPoliticalAttack();
  testPoliticalReferenceNeedsReview();
  testEducationalDiscussion();
  console.log("\nAll politics module tests passed.");
}

main();
