/**
 * Tests for the V3 national security legal module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/modules/nationalSecurity/nationalSecurityTests.ts
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
import { NATIONAL_SECURITY_EXAMPLES } from "./nationalSecurityExamples.js";
import { NATIONAL_SECURITY_MODULE, isNationalSecurityEvidenceText } from "./nationalSecurityModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: NATIONAL_SECURITY_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "security scene",
      narrativeIntent: "promotion",
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
      narrativeIntent: "promotion",
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
      sceneMemory: "مشهد أمني داخلي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها عم الصمت."],
      narrativeContext: "Direct security dialogue.",
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
    moduleId: NATIONAL_SECURITY_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(NATIONAL_SECURITY_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(NATIONAL_SECURITY_MODULE);
  assert.equal(registry.load(NATIONAL_SECURITY_MODULE.id)?.id, NATIONAL_SECURITY_MODULE.id);
  assert.equal(isNationalSecurityEvidenceText("جندوا الشباب للتنظيم المتطرف"), true);
  assert.equal(isNationalSecurityEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(NATIONAL_SECURITY_EXAMPLES.positive.length > 0);
  assert.ok(NATIONAL_SECURITY_EXAMPLES.negative.length > 0);
  console.log("✓ national security module registry and helpers");
}

function testTerrorismIncitement(): void {
  const decision = evaluate(makeInput("انضموا للتنظيم المتطرف الليلة"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(15), true);
  console.log("✓ extremist recruitment");
}

function testPublicOrderAndRiots(): void {
  const decision = evaluate(makeInput("لنفجر الشارع الليلة وننشر الفوضى"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(12), true);
  console.log("✓ public disorder and riots");
}

function testMilitaryDisclosure(): void {
  const decision = evaluate(makeInput("سربوا الأسرار العسكرية فوراً"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(21), true);
  console.log("✓ military disclosure");
}

function testEducationalDiscussion(): void {
  const decision = evaluate(
    makeInput("في الدرس نشرح معنى الأمن الوطني ومكافحة الإرهاب", {
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
        semanticMeaning: "An educational explanation of national security.",
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
        localContext: "في الدرس نشرح معنى الأمن الوطني ومكافحة الإرهاب",
        chunkContext: "Chunk 1",
        neighboringSentences: ["قبلها كان هناك تمهيد.", "بعدها أمثلة تعليمية."],
        narrativeContext: "Educational lecture about security.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational discussion");
}

function testCondemnation(): void {
  const decision = evaluate(makeInput("أدين هذا العمل الإرهابي وأرفضه"));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ condemnation of security attack");
}

function testSatireNeedsReview(): void {
  const decision = evaluate(
    makeInput("في المسرحية يسخر الممثل من التنظيم المتطرف", {
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
        semanticMeaning: "Satirical mockery of an extremist group.",
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
        localContext: "في المسرحية يسخر الممثل من التنظيم المتطرف",
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

function testNoSignal(): void {
  const decision = evaluate(makeInput("جلسوا يتحدثون بهدوء عن العمل والسفر."));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no national security signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("انضموا للتنظيم المتطرف"));
  const second = evaluate(makeInput("انضموا للتنظيم المتطرف"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testTerrorismIncitement();
  testPublicOrderAndRiots();
  testMilitaryDisclosure();
  testEducationalDiscussion();
  testCondemnation();
  testSatireNeedsReview();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll national security module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

