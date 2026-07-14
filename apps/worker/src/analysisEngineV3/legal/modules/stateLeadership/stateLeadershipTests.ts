/**
 * Tests for the V3 state leadership legal module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/modules/stateLeadership/stateLeadershipTests.ts
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
import { STATE_LEADERSHIP_EXAMPLES } from "./stateLeadershipExamples.js";
import { STATE_LEADERSHIP_MODULE, isStateLeadershipEvidenceText } from "./stateLeadershipModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: STATE_LEADERSHIP_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "political scene",
      narrativeIntent: "attack",
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
      sceneMemory: "مشهد سياسي داخلي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها عم الصمت."],
      narrativeContext: "Direct political dialogue.",
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
    moduleId: STATE_LEADERSHIP_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(STATE_LEADERSHIP_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(STATE_LEADERSHIP_MODULE);
  assert.equal(registry.load(STATE_LEADERSHIP_MODULE.id)?.id, STATE_LEADERSHIP_MODULE.id);
  assert.equal(isStateLeadershipEvidenceText("اقلبوا الحكم"), true);
  assert.equal(isStateLeadershipEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(STATE_LEADERSHIP_EXAMPLES.positive.length > 0);
  assert.ok(STATE_LEADERSHIP_EXAMPLES.negative.length > 0);
  console.log("✓ state leadership module registry and helpers");
}

function testDirectInsultLeader(): void {
  const decision = evaluate(makeInput("هذا الرئيس كذاب وفاسد"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(17), true);
  console.log("✓ direct insult to leader");
}

function testIncitementAgainstGovernment(): void {
  const decision = evaluate(makeInput("اسقطوا الحكومة الليلة"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(14), true);
  console.log("✓ incitement against state leadership");
}

function testEducationalDiscussion(): void {
  const decision = evaluate(
    makeInput("في الدرس نشرح معنى الرئاسة في السياسة", {
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
        semanticMeaning: "An educational explanation of political leadership.",
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
        localContext: "في الدرس نشرح معنى الرئاسة في السياسة",
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

function testDocumentaryNarration(): void {
  const decision = evaluate(
    makeInput("الوثائقي يذكر خطابًا قديما للرئيس", {
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
        semanticMeaning: "Historical documentary reference to a political speech.",
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
        localContext: "الوثائقي يذكر خطابًا قديما للرئيس",
        chunkContext: "Chunk 2",
        neighboringSentences: ["قبلها شرح المؤرخ الخلفية.", "بعدها عرضت صور قديمة."],
        narrativeContext: "Historical documentary context.",
        confidence: 0.91,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ documentary narration");
}

function testCondemnationOfPoliticalAttack(): void {
  const decision = evaluate(makeInput("هذه الإهانة للرئيس مرفوضة ومدانة"));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ condemnation of political attack");
}

function testSatireNeedsReview(): void {
  const decision = evaluate(
    makeInput("في المسرحية يسخر الممثل من الزعيم", {
      narrative: {
        speaker: "Actor",
        listener: "Audience",
        target: null,
        narrativeVoice: "dialogue",
        sceneType: "fiction",
        narrativeIntent: "mockery",
        storyPosition: "conflict",
        relationship: "performer",
        emotionalTone: "comic",
        condemnation: false,
        approval: false,
        neutrality: false,
        historicalContext: false,
        dream: false,
        flashback: false,
        comedy: true,
        satire: true,
        threat: false,
        instruction: false,
        news: false,
        documentary: false,
        dialogue: true,
        narration: false,
        sceneDescription: false,
        confidence: 0.88,
      },
      semantic: {
        semanticMeaning: "Satirical political mockery.",
        narrativeIntent: "mockery",
        conversationRole: "speaker",
        sceneRole: "dialogue",
        speaker: "Actor",
        listener: "Audience",
        target: null,
        victim: null,
        emotion: "comic",
        riskContext: "medium",
        confidence: 0.88,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is fictional and satirical.",
        sceneMemory: "A comedic stage scene.",
        localContext: "في المسرحية يسخر الممثل من الزعيم",
        chunkContext: "Chunk 3",
        neighboringSentences: ["قبلها جاء تمهيد هزلي.", "بعدها استمرت السخرية."],
        narrativeContext: "Satirical fiction context.",
        confidence: 0.87,
      }),
    }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  console.log("✓ satire needs review");
}

function testNoStateSignal(): void {
  const decision = evaluate(makeInput("جلسوا يتحدثون بهدوء عن العمل والسفر."));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no state leadership signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("هذا الرئيس كذاب"));
  const second = evaluate(makeInput("هذا الرئيس كذاب"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testDirectInsultLeader();
  testIncitementAgainstGovernment();
  testEducationalDiscussion();
  testDocumentaryNarration();
  testCondemnationOfPoliticalAttack();
  testSatireNeedsReview();
  testNoStateSignal();
  testDeterministicOutput();
  console.log("\nAll state leadership module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
