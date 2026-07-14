/**
 * Tests for the V3 religion legal module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/modules/religion/religionTests.ts
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
import { RELIGION_EXAMPLES } from "./religionExamples.js";
import { RELIGION_MODULE, isReligionEvidenceText } from "./religionModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: RELIGION_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "attack",
      storyPosition: "escalation",
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
          startOffset: 20,
          endOffset: 20 + text.length,
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
      narrativeIntent: "attack",
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
      sceneMemory: "مشهد داخلي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها عم الصمت."],
      narrativeContext: "Direct dialogue with religion-related language.",
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
  return {
    moduleId: RELIGION_MODULE.id,
    intelligence: buildIntelligenceContext({
      ...makeBaseInput(text),
      ...overrides,
      evidence: overrides?.evidence ?? makeBaseInput(text).evidence,
      narrative: overrides?.narrative ?? makeBaseInput(text).narrative,
      semantic: overrides?.semantic ?? makeBaseInput(text).semantic,
      context: overrides?.context ?? makeBaseInput(text).context,
      glossary: overrides?.glossary ?? makeBaseInput(text).glossary,
      storyMemory: overrides?.storyMemory ?? makeBaseInput(text).storyMemory,
    }),
  };
}

function evaluate(input: LegalModuleEvaluationInput) {
  const registry = new LegalModuleRegistry().register(RELIGION_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(RELIGION_MODULE);
  assert.equal(registry.load(RELIGION_MODULE.id)?.id, RELIGION_MODULE.id);
  assert.equal(isReligionEvidenceText("النبي كذاب"), true);
  assert.equal(isReligionEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(RELIGION_EXAMPLES.positive.length > 0);
  assert.ok(RELIGION_EXAMPLES.negative.length > 0);
  console.log("✓ religion module registry and helpers");
}

function testDirectInsultProphet(): void {
  const decision = evaluate(makeInput("هذا النبي كذاب والدين باطل"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(2), true);
  console.log("✓ direct insult to prophet");
}

function testIndirectMockeryHolyBook(): void {
  const decision = evaluate(makeInput("المصحف مجرد ورق لا قيمة له"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(1), true);
  console.log("✓ indirect mockery of holy book");
}

function testEducationalDiscussion(): void {
  const decision = evaluate(
    makeInput("في الدرس نشرح معنى احترام المقدسات الدينية", {
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
        semanticMeaning: "An educational explanation of religion and sanctities.",
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
        localContext: "في الدرس نشرح معنى احترام المقدسات الدينية",
        chunkContext: "Chunk 1",
        neighboringSentences: ["قبلها كان هناك تمهيد.", "بعدها أمثلة تعليمية."],
        narrativeContext: "Educational lecture about religion.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational discussion");
}

function testHistoricalNarration(): void {
  const decision = evaluate(
    makeInput("الوثائقي يذكر حادثة قديمة للإساءة إلى المسجد", {
      narrative: {
        speaker: null,
        listener: null,
        target: null,
        narrativeVoice: "narration",
        sceneType: "documentary",
        narrativeIntent: "historical narration",
        storyPosition: "background",
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
        confidence: 0.91,
      },
      semantic: {
        semanticMeaning: "Historical documentary reference to a desecration incident.",
        narrativeIntent: "historical narration",
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
        storyMemory: "The scene is documentary in tone.",
        sceneMemory: "Archive footage.",
        localContext: "الوثائقي يذكر حادثة قديمة للإساءة إلى المسجد",
        chunkContext: "Chunk 2",
        neighboringSentences: ["قبلها شرح المؤرخ الخلفية.", "بعدها عرضت صور قديمة."],
        narrativeContext: "Historical documentary context.",
        confidence: 0.91,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ historical/documentary narration");
}

function testCondemnationOfReligionHarm(): void {
  const decision = evaluate(makeInput("هذه الإساءة إلى القرآن مرفوضة ومدانة"));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ condemnation of religion harm");
}

function testFictionalMockeryNeedsReview(): void {
  const decision = evaluate(
    makeInput("في الرواية يقول الشرير: الدين كله باطل", {
      narrative: {
        speaker: "Villain",
        listener: "Crowd",
        target: null,
        narrativeVoice: "dialogue",
        sceneType: "fiction",
        narrativeIntent: "attack",
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
        confidence: 0.87,
      },
      semantic: {
        semanticMeaning: "Fictional hostile speech about religion.",
        narrativeIntent: "attack",
        conversationRole: "speaker",
        sceneRole: "dialogue",
        speaker: "Villain",
        listener: "Crowd",
        target: null,
        victim: null,
        emotion: "hostile",
        riskContext: "medium",
        confidence: 0.88,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is fictional.",
        sceneMemory: "A dramatic confrontation.",
        localContext: "في الرواية يقول الشرير: الدين كله باطل",
        chunkContext: "Chunk 3",
        neighboringSentences: ["قبلها تحدى البطل.", "بعدها استمرت القصة في مسار مختلف."],
        narrativeContext: "Fictional role-play with religion-related language.",
        confidence: 0.86,
      }),
    }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  console.log("✓ fictional religion attack needs review");
}

function testNoReligion(): void {
  const decision = evaluate(makeInput("جلسوا يتحدثون بهدوء عن العمل والسفر."));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no religion signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("هذا الدين باطل"));
  const second = evaluate(makeInput("هذا الدين باطل"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testDirectInsultProphet();
  testIndirectMockeryHolyBook();
  testEducationalDiscussion();
  testHistoricalNarration();
  testCondemnationOfReligionHarm();
  testFictionalMockeryNeedsReview();
  testNoReligion();
  testDeterministicOutput();
  console.log("\nAll religion module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
