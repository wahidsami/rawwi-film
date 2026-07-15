import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { SEXUALITY_EXAMPLES, type SexualityExample } from "./sexualityExamples.js";
import { SEXUALITY_MODULE, isSexualityEvidenceText } from "./sexualityModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: SEXUALITY_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "sexual",
      storyPosition: "conflict",
      relationship: "partner",
      emotionalTone: "intimate",
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
      narrativeIntent: "sexual",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "intimate",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد حميم",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك تلميح.", "بعدها ساد الصمت."],
      narrativeContext: "Direct sexual dialogue context.",
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
    moduleId: SEXUALITY_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(SEXUALITY_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(SEXUALITY_MODULE);
  assert.equal(registry.load(SEXUALITY_MODULE.id)?.id, SEXUALITY_MODULE.id);
  assert.equal(isSexualityEvidenceText("مشهد عارٍ واضح"), true);
  assert.equal(isSexualityEvidenceText("حوار عن العمل والسفر"), false);
  assert.ok(SEXUALITY_EXAMPLES.positive.length > 0);
  assert.ok(SEXUALITY_EXAMPLES.negative.length > 0);
  console.log("✓ sexuality module registry and helpers");
}

function testExplicitSexualContent(): void {
  const decision = evaluate(makeInput("مشهد عارٍ صريح في غرفة النوم"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(9), true);
  assert.equal(decision.finding?.articleIds.includes(5), true);
  console.log("✓ explicit sexual content");
}

function testImpliedSexualContent(): void {
  const decision = evaluate(makeInput("في المشهد إيحاء واضح وتلميح جنسي"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(9), true);
  console.log("✓ implied sexual content");
}

function testEducationalContext(): void {
  const decision = evaluate(
    makeInput("شرح تعليمي عن التثقيف الجنسي", {
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
        confidence: 0.94,
      },
      semantic: {
        ...makeBaseInput("شرح تعليمي عن التثقيف الجنسي").semantic,
        semanticMeaning: "Educational sexual explanation.",
        narrativeIntent: "education",
        sceneRole: "educational",
        confidence: 0.94,
      },
      context: createLegalContextResult({
        storyMemory: "Educational scene.",
        sceneMemory: "Classroom.",
        localContext: "شرح تعليمي عن التثقيف الجنسي",
        chunkContext: "Chunk 1",
        neighboringSentences: ["هذا درس توعوي."],
        narrativeContext: "Educational context.",
        confidence: 0.93,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational context");
}

function testMedicalContext(): void {
  const decision = evaluate(
    makeInput("فحص طبي يشرح الصحة الجنسية", {
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
        ...makeBaseInput("فحص طبي يشرح الصحة الجنسية").semantic,
        semanticMeaning: "Medical sexual health discussion.",
        narrativeIntent: "medical",
        sceneRole: "medical",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Medical scene.",
        sceneMemory: "Clinic.",
        localContext: "فحص طبي يشرح الصحة الجنسية",
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

function testArtisticContext(): void {
  const decision = evaluate(
    makeInput("لقطة فنية تركز على الجسد والضوء", {
      narrative: {
        speaker: "Director",
        listener: "Crew",
        target: "Audience",
        narrativeVoice: "narration",
        sceneType: "cinematic",
        narrativeIntent: "artistic",
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
        confidence: 0.94,
      },
      semantic: {
        ...makeBaseInput("لقطة فنية تركز على الجسد والضوء").semantic,
        semanticMeaning: "Artistic sexual framing.",
        narrativeIntent: "artistic",
        sceneRole: "visual",
        confidence: 0.94,
      },
      context: createLegalContextResult({
        storyMemory: "Artistic scene.",
        sceneMemory: "Cinematic framing.",
        localContext: "لقطة فنية تركز على الجسد والضوء",
        chunkContext: "Chunk 1",
        neighboringSentences: ["تصوير جمالي."],
        narrativeContext: "Artistic context.",
        confidence: 0.93,
      }),
    }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  console.log("✓ artistic context");
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
  console.log("✓ no sexual signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("مشهد عارٍ صريح في غرفة النوم"));
  const second = evaluate(makeInput("مشهد عارٍ صريح في غرفة النوم"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testExplicitSexualContent();
  testImpliedSexualContent();
  testEducationalContext();
  testMedicalContext();
  testArtisticContext();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll sexuality module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
