import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { HISTORY_EXAMPLES } from "./historyExamples.js";
import { HISTORY_MODULE, isHistoryEvidenceText } from "./historyModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: HISTORY_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Narrator",
      listener: "Audience",
      target: "Audience",
      narrativeVoice: "narration",
      sceneType: "history scene",
      narrativeIntent: "history",
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
      documentary: false,
      dialogue: false,
      narration: true,
      sceneDescription: true,
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
      narrativeIntent: "history",
      conversationRole: "speaker",
      sceneRole: "narration",
      speaker: "Narrator",
      listener: "Audience",
      target: "Audience",
      victim: "Audience",
      emotion: "neutral",
      riskContext: "low",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد تاريخي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك توضيح.", "بعدها ظهر التصحيح."],
      narrativeContext: "Historical context.",
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
    moduleId: HISTORY_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(HISTORY_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(HISTORY_MODULE);
  assert.equal(registry.load(HISTORY_MODULE.id)?.id, HISTORY_MODULE.id);
  assert.equal(isHistoryEvidenceText("هذا تاريخ مزيف"), true);
  assert.equal(isHistoryEvidenceText("السياق تاريخي محايد"), true);
  assert.ok(HISTORY_EXAMPLES.positive.length > 0);
  assert.ok(HISTORY_EXAMPLES.negative.length > 0);
  console.log("✓ history module registry and helpers");
}

function testFabricatedHistory(): void {
  const decision = evaluate(makeInput("هذا تاريخ مزيف ومفبرك"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ fabricated history");
}

function testFalseDocumentaryClaim(): void {
  const decision = evaluate(makeInput("هذا وثائقي مزيف وادعاء تاريخي كاذب"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ false documentary claim");
}

function testFabricatedQuotation(): void {
  const decision = evaluate(makeInput("هذا اقتباس مفبرك من الأرشيف"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ fabricated quotation");
}

function testEducationalContext(): void {
  const decision = evaluate(
    makeInput("المعلم يشرح سبب تحريف التاريخ", {
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
        ...makeBaseInput("المعلم يشرح سبب تحريف التاريخ").semantic,
        semanticMeaning: "Educational discussion of historical distortion.",
        narrativeIntent: "education",
        sceneRole: "educational",
        confidence: 0.95,
      },
      context: createLegalContextResult({
        storyMemory: "Educational scene.",
        sceneMemory: "Classroom.",
        localContext: "المعلم يشرح سبب تحريف التاريخ",
        chunkContext: "Chunk 1",
        neighboringSentences: ["هذا درس توعوي."],
        narrativeContext: "Educational context.",
        confidence: 0.94,
      }),
    }),
  );
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ educational context still captures false history");
}

function testNoSignal(): void {
  const decision = evaluate(
    makeInput("جلسوا يتحدثون عن السفر والطعام.", {
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
        ...makeBaseInput("جلسوا يتحدثون عن السفر والطعام.").semantic,
        semanticMeaning: "Neutral conversation about travel and food.",
        narrativeIntent: "neutral",
        sceneRole: "dialogue",
        emotion: "neutral",
        confidence: 0.9,
      },
      context: createLegalContextResult({
        storyMemory: "Neutral discussion.",
        sceneMemory: "Cafe talk.",
        localContext: "جلسوا يتحدثون عن السفر والطعام.",
        chunkContext: "Chunk 1",
        neighboringSentences: ["لا يوجد شيء مهم هنا."],
        narrativeContext: "Neutral conversation.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no history signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("هذا تاريخ مزيف ومفبرك"));
  const second = evaluate(makeInput("هذا تاريخ مزيف ومفبرك"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testFabricatedHistory();
  testFalseDocumentaryClaim();
  testFabricatedQuotation();
  testEducationalContext();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll history module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
