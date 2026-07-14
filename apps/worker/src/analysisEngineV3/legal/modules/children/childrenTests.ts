/**
 * Tests for the V3 children reviewer decision module.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/modules/children/childrenTests.ts
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
import { CHILDREN_EXAMPLES } from "./childrenExamples.js";
import { CHILDREN_MODULE, isChildrenEvidenceText } from "./childrenModule.js";

function makeBaseInput(text: string): IntelligenceBuilderInput {
  return {
    moduleId: CHILDREN_MODULE.id,
    storyMemory: "السياق حاضر.",
    narrative: {
      speaker: "Parent",
      listener: "Child",
      target: "Child",
      narrativeVoice: "dialogue",
      sceneType: "family scene",
      narrativeIntent: "abuse",
      storyPosition: "conflict",
      relationship: "caretaker",
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
      narrativeIntent: "abuse",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Parent",
      listener: "Child",
      target: "Child",
      victim: "Child",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "السياق حاضر.",
      sceneMemory: "مشهد عائلي",
      localContext: text,
      chunkContext: "Chunk 1",
      neighboringSentences: ["قبلها كان هناك نقاش.", "بعدها عم الصمت."],
      narrativeContext: "Direct harmful family dialogue.",
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
    moduleId: CHILDREN_MODULE.id,
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
  const registry = new LegalModuleRegistry().register(CHILDREN_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testRegistryAndHelpers(): void {
  const registry = new LegalModuleRegistry().register(CHILDREN_MODULE);
  assert.equal(registry.load(CHILDREN_MODULE.id)?.id, CHILDREN_MODULE.id);
  assert.equal(isChildrenEvidenceText("يضرب الطفل بقسوة"), true);
  assert.equal(isChildrenEvidenceText("جلسوا يتحدثون عن السفر"), false);
  assert.ok(CHILDREN_EXAMPLES.positive.length > 0);
  assert.ok(CHILDREN_EXAMPLES.negative.length > 0);
  console.log("✓ children module registry and helpers");
}

function testDirectAbuse(): void {
  const decision = evaluate(makeInput("يضرب الطفل بقسوة"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(6), true);
  console.log("✓ direct abuse");
}

function testNeglect(): void {
  const decision = evaluate(makeInput("ترك الطفل بلا طعام أو ماء طوال اليوم"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ neglect");
}

function testGrooming(): void {
  const decision = evaluate(makeInput("استدرج القاصر بالهدايا والسرية"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  console.log("✓ grooming");
}

function testPsychologicalAbuse(): void {
  const decision = evaluate(makeInput("يسخرون من الطفل ويذلونه أمام الجميع"));
  assert.equal(decision.status, "accept");
  assert.equal(decision.finding !== null, true);
  assert.equal(decision.finding?.articleIds.includes(17), true);
  console.log("✓ psychological abuse");
}

function testEducationalDiscussion(): void {
  const decision = evaluate(
    makeInput("في الدرس نشرح كيف نحمي الطفل من الأذى", {
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
        ...makeBaseInput("في الدرس نشرح كيف نحمي الطفل من الأذى").semantic,
        semanticMeaning: "An educational explanation of child protection.",
        narrativeIntent: "instruction",
        sceneRole: "educational",
        confidence: 0.9,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is instructional.",
        sceneMemory: "Classroom.",
        localContext: "في الدرس نشرح كيف نحمي الطفل من الأذى",
        chunkContext: "Chunk 1",
        neighboringSentences: ["قبلها كان هناك تمهيد.", "بعدها أمثلة تعليمية."],
        narrativeContext: "Educational lecture about child protection.",
        confidence: 0.9,
      }),
    }),
  );
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ educational discussion");
}

function testCondemnation(): void {
  const decision = evaluate(makeInput("أدين هذا الاستغلال للطفل وأرفضه"));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ condemnation");
}

function testFictionNeedsReview(): void {
  const decision = evaluate(
    makeInput("في الرواية يهدد الشرير الطفل", {
      narrative: {
        speaker: "Villain",
        listener: "Child",
        target: "Child",
        narrativeVoice: "dialogue",
        sceneType: "fiction",
        narrativeIntent: "threat",
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
        threat: true,
        instruction: false,
        news: false,
        documentary: false,
        dialogue: true,
        narration: false,
        sceneDescription: false,
        confidence: 0.88,
      },
      semantic: {
        ...makeBaseInput("في الرواية يهدد الشرير الطفل").semantic,
        semanticMeaning: "Fictional threat against a child.",
        narrativeIntent: "threat",
        confidence: 0.88,
      },
      context: createLegalContextResult({
        storyMemory: "The scene is fictional.",
        sceneMemory: "A dramatic confrontation.",
        localContext: "في الرواية يهدد الشرير الطفل",
        chunkContext: "Chunk 3",
        neighboringSentences: ["قبلها تحدى البطل.", "بعدها استمرت القصة في مسار مختلف."],
        narrativeContext: "Fictional threat toward a child.",
        confidence: 0.87,
      }),
    }),
  );
  assert.equal(decision.status, "needs_review");
  assert.equal(decision.finding !== null, true);
  console.log("✓ fiction needs review");
}

function testNoSignal(): void {
  const decision = evaluate(makeInput("جلسوا يتحدثون بهدوء عن العمل والسفر."));
  assert.equal(decision.status, "reject");
  assert.equal(decision.finding, null);
  console.log("✓ no children signal");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput("يضرب الطفل بقسوة"));
  const second = evaluate(makeInput("يضرب الطفل بقسوة"));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  console.log("✓ deterministic output");
}

async function main(): Promise<void> {
  testRegistryAndHelpers();
  testDirectAbuse();
  testNeglect();
  testGrooming();
  testPsychologicalAbuse();
  testEducationalDiscussion();
  testCondemnation();
  testFictionNeedsReview();
  testNoSignal();
  testDeterministicOutput();
  console.log("\nAll children module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

