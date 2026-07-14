import { strict as assert } from "node:assert";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { VIOLENCE_EXAMPLES } from "./violenceExamples.js";
import { VIOLENCE_MODULE, isViolenceEvidenceText } from "./violenceModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: VIOLENCE_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "fight scene",
      narrativeIntent: "violence",
      storyPosition: "conflict",
      relationship: "enemy",
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
      narrativeIntent: "violence",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد عنيف",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك شجار.", "بعدها صمت المكان."],
      narrativeContext: "Direct violence context.",
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
    moduleId: VIOLENCE_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(VIOLENCE_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(VIOLENCE_MODULE);
  assert.equal(registry.load(VIOLENCE_MODULE.id)?.id, VIOLENCE_MODULE.id);
  assert.equal(isViolenceEvidenceText("ضربه بعنف"), true);
  assert.equal(isViolenceEvidenceText("جلسوا يتحدثون بهدوء"), false);
  assert.ok(VIOLENCE_EXAMPLES.positive.length > 0);
  assert.ok(VIOLENCE_EXAMPLES.negative.length > 0);
  console.log("✓ violence module registry and helpers");
}

function testDirectViolence(): void {
  const decision = evaluate(makeInput("طعن الرجل بسكين في الزقاق"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(14), true);
  console.log("✓ direct violence");
}

function testSelfDefense(): void {
  const decision = evaluate(makeInput("دافع عن نفسه بعد الاعتداء"));
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(12), true);
  console.log("✓ self-defense");
}

function testDocumentaryViolence(): void {
  const decision = evaluate(
    makeInput("وثائقي عن القتل في الحرب", {
      narrative: {
        speaker: "Narrator",
        listener: "Audience",
        target: "Victim",
        narrativeVoice: "narration",
        sceneType: "documentary",
        narrativeIntent: "documentary",
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
        documentary: true,
        dialogue: false,
        narration: true,
        sceneDescription: true,
        confidence: 0.93,
      },
      semantic: {
        ...makeBaseInput("وثائقي عن القتل في الحرب").semantic,
        semanticMeaning: "Documentary violence description.",
        narrativeIntent: "documentary",
        sceneRole: "documentary",
        confidence: 0.93,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is documentary.",
        sceneMemory: "War documentary.",
        localContext: "وثائقي عن القتل في الحرب",
        chunkContext: "Chunk 1",
        neighboringSentences: ["يتحدث عن الحرب."],
        narrativeContext: "Documentary violence.",
        confidence: 0.92,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ documentary violence");
}

function testCondemnation(): void {
  const decision = evaluate(makeInput("أدين هذا العنف الوحشي"));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ condemnation");
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
  console.log("✓ no violence signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("طعن الرجل بسكين في الزقاق"));
  const second = evaluate(makeInput("طعن الرجل بسكين في الزقاق"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testDirectViolence();
  testSelfDefense();
  testDocumentaryViolence();
  testCondemnation();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll violence module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
