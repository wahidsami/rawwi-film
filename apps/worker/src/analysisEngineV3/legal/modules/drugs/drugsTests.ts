import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { DRUGS_EXAMPLES } from "./drugsExamples.js";
import { DRUGS_MODULE, isDrugsEvidenceText } from "./drugsModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: DRUGS_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "drug",
      storyPosition: "conflict",
      relationship: "dealer",
      emotionalTone: "neutral",
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
      candidates: [
        {
          text,
          startOffset: 0,
          endOffset: text.length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    }),
    semantic: {
      semanticMeaning: text,
      narrativeIntent: "drug",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "neutral",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد مخدرات",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك تلميح.", "بعدها ساد الصمت."],
      narrativeContext: "Drug context.",
      confidence: 0.95,
    }),
    glossary: {
      title: "Test glossary",
      entries: [],
      notes: [],
    },
  };
}

function makeInput(text: string, overrides?: Partial<IntelligenceBuilderInput>): LegalModuleEvaluationInput {
  const base = makeBaseInput(text);
  return {
    moduleId: DRUGS_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(DRUGS_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(DRUGS_MODULE);
  assert.equal(registry.load(DRUGS_MODULE.id)?.id, DRUGS_MODULE.id);
  assert.equal(isDrugsEvidenceText("يبيع المخدرات"), true);
  assert.equal(isDrugsEvidenceText("جلسوا يتحدثون"), false);
  assert.ok(DRUGS_EXAMPLES.positive.length > 0);
  assert.ok(DRUGS_EXAMPLES.negative.length > 0);
  console.log("✓ drugs module registry and helpers");
}

function testDirectUse(): void {
  const decision = evaluate(makeInput("يتعاطى المخدر الآن"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ direct drug use");
}

function testTrafficking(): void {
  const decision = evaluate(makeInput("يبيع المخدرات للزبائن"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ trafficking");
}

function testManufacturing(): void {
  const decision = evaluate(makeInput("يصنع الحبوب في المختبر"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ manufacturing");
}

function testPromotion(): void {
  const decision = evaluate(makeInput("جربها وستحبها"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ promotion");
}

function testMedicalContext(): void {
  const decision = evaluate(
    makeInput("الطبيب وصف الدواء بجرعة دقيقة", {
      narrative: {
        speaker: "Doctor",
        listener: "Patient",
        target: "Patient",
        narrativeVoice: "narration",
        sceneType: "clinic",
        narrativeIntent: "medical",
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
        instruction: false,
        news: false,
        documentary: false,
        dialogue: false,
        narration: true,
        sceneDescription: true,
        confidence: 0.95,
      },
      semantic: {
        ...makeBaseInput("الطبيب وصف الدواء بجرعة دقيقة").semantic,
        semanticMeaning: "Medical drug use.",
        narrativeIntent: "medical",
        sceneRole: "medical",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Medical scene.",
        sceneMemory: "Clinic.",
        localContext: "الطبيب وصف الدواء بجرعة دقيقة",
        chunkContext: "Chunk 1",
        neighboringSentences: ["الطبيب يشرح العلاج."],
        narrativeContext: "Medical context.",
        confidence: 0.94,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ medical context");
}

function testEducationalContext(): void {
  const decision = evaluate(
    makeInput("المدرس يشرح مخاطر الجرعة الزائدة", {
      narrative: {
        speaker: "Teacher",
        listener: "Students",
        target: "Students",
        narrativeVoice: "narration",
        sceneType: "classroom",
        narrativeIntent: "education",
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
        confidence: 0.95,
      },
      semantic: {
        ...makeBaseInput("المدرس يشرح مخاطر الجرعة الزائدة").semantic,
        semanticMeaning: "Educational drug warning.",
        narrativeIntent: "education",
        sceneRole: "educational",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Educational scene.",
        sceneMemory: "Classroom.",
        localContext: "المدرس يشرح مخاطر الجرعة الزائدة",
        chunkContext: "Chunk 1",
        neighboringSentences: ["هذا درس توعوي."],
        narrativeContext: "Educational context.",
        confidence: 0.94,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational context");
}

function testRehabilitationContext(): void {
  const decision = evaluate(
    makeInput("ينتظم في برنامج تأهيلي", {
      narrative: {
        speaker: "Counselor",
        listener: "Patient",
        target: "Patient",
        narrativeVoice: "narration",
        sceneType: "rehabilitation",
        narrativeIntent: "medical",
        storyPosition: "resolution",
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
        documentary: false,
        dialogue: false,
        narration: true,
        sceneDescription: true,
        confidence: 0.95,
      },
      semantic: {
        ...makeBaseInput("ينتظم في برنامج تأهيلي").semantic,
        semanticMeaning: "Rehabilitation context.",
        narrativeIntent: "medical",
        sceneRole: "rehabilitation",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Rehabilitation scene.",
        sceneMemory: "Rehab center.",
        localContext: "ينتظم في برنامج تأهيلي",
        chunkContext: "Chunk 1",
        neighboringSentences: ["يتلقى الدعم."],
        narrativeContext: "Rehabilitation context.",
        confidence: 0.94,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ rehabilitation context");
}

function testNoSignal(): void {
  const decision = evaluate(
    makeInput("جلسوا يتحدثون عن العمل والسفر.", {
      narrative: {
        speaker: "A",
        listener: "B",
        target: null,
        narrativeVoice: "dialogue",
        sceneType: "conversation",
        narrativeIntent: "neutral",
        storyPosition: "setup",
        relationship: "friend",
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
        confidence: 0.9,
      },
      semantic: {
        ...makeBaseInput("جلسوا يتحدثون عن العمل والسفر.").semantic,
        semanticMeaning: "Neutral conversation about work and travel.",
        narrativeIntent: "neutral",
        sceneRole: "dialogue",
        emotion: "neutral",
        confidence: 0.9,
      },
      context: createLegalContextResult({
        storyMemory: "Neutral discussion.",
        sceneMemory: "Office talk.",
        localContext: "جلسوا يتحدثون عن العمل والسفر.",
        chunkContext: "Chunk 1",
        neighboringSentences: ["لا يوجد شيء مهم هنا."],
        narrativeContext: "Neutral conversation.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no drug signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("يتعاطى المخدر الآن"));
  const second = evaluate(makeInput("يتعاطى المخدر الآن"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testDirectUse();
  testTrafficking();
  testManufacturing();
  testPromotion();
  testMedicalContext();
  testEducationalContext();
  testRehabilitationContext();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll drugs module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
