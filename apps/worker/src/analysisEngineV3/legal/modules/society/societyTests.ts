import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { SOCIETY_EXAMPLES } from "./societyExamples.js";
import { SOCIETY_MODULE, isSocietyEvidenceText } from "./societyModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: SOCIETY_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "society",
      storyPosition: "conflict",
      relationship: "neighbor",
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
      narrativeIntent: "society",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "hostile",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد اجتماعي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك توتر.", "بعدها ساد الصمت."],
      narrativeContext: "Social context.",
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
    moduleId: SOCIETY_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(SOCIETY_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(SOCIETY_MODULE);
  assert.equal(registry.load(SOCIETY_MODULE.id)?.id, SOCIETY_MODULE.id);
  assert.equal(isSocietyEvidenceText("هذه عنصرية واضحة"), true);
  assert.equal(isSocietyEvidenceText("جلسوا يتحدثون"), false);
  assert.ok(SOCIETY_EXAMPLES.positive.length > 0);
  assert.ok(SOCIETY_EXAMPLES.negative.length > 0);
  console.log("✓ society module registry and helpers");
}

function testRacism(): void {
  const decision = evaluate(makeInput("هذه عنصرية واضحة ضد الجار"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ racism");
}

function testDiscrimination(): void {
  const decision = evaluate(makeInput("يمارسون التمييز ضده بسبب أصله"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ discrimination");
}

function testHateSpeech(): void {
  const decision = evaluate(makeInput("خطاب كراهية ضد النساء"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ hate speech");
}

function testEducationalContext(): void {
  const decision = evaluate(
    makeInput("المدرس يشرح لماذا التنمر خطأ", {
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
        ...makeBaseInput("المدرس يشرح لماذا التنمر خطأ").semantic,
        semanticMeaning: "Educational explanation of bullying.",
        narrativeIntent: "education",
        sceneRole: "educational",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Educational scene.",
        sceneMemory: "Classroom.",
        localContext: "المدرس يشرح لماذا التنمر خطأ",
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

function testDocumentaryContext(): void {
  const decision = evaluate(
    makeInput("الوثائقي يناقش التمييز تاريخيًا", {
      narrative: {
        speaker: "Narrator",
        listener: "Audience",
        target: "Community",
        narrativeVoice: "narration",
        sceneType: "documentary",
        narrativeIntent: "documentary",
        storyPosition: "setup",
        relationship: null,
        emotionalTone: "neutral",
        condemnation: false,
        approval: false,
        neutrality: true,
        historicalContext: true,
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
        confidence: 0.95,
      },
      semantic: {
        ...makeBaseInput("الوثائقي يناقش التمييز تاريخيًا").semantic,
        semanticMeaning: "Documentary on discrimination.",
        narrativeIntent: "documentary",
        sceneRole: "documentary",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Documentary scene.",
        sceneMemory: "Archive footage.",
        localContext: "الوثائقي يناقش التمييز تاريخيًا",
        chunkContext: "Chunk 1",
        neighboringSentences: ["المادة تاريخية."],
        narrativeContext: "Documentary context.",
        confidence: 0.94,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ documentary context");
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
  console.log("✓ no society signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("هذه عنصرية واضحة ضد الجار"));
  const second = evaluate(makeInput("هذه عنصرية واضحة ضد الجار"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testRacism();
  testDiscrimination();
  testHateSpeech();
  testEducationalContext();
  testDocumentaryContext();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll society module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
