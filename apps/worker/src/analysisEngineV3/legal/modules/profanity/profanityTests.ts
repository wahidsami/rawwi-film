/**
 * Tests for the first concrete V3 legal module: profanity.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/modules/profanity/profanityTests.ts
 */
import { createLegalContextResult } from "../../legalContext.js";
import { createLegalEvidenceResult } from "../../legalEvidence.js";
import { createLegalEngine } from "../../legalEngine.js";
import { createLegalModuleLoader } from "../../legalModuleLoader.js";
import { LegalModuleRegistry } from "../../legalModuleRegistry.js";
import type { LegalModuleEvaluationInput } from "../../legalModule.js";
import { buildIntelligenceContext } from "../../../intelligence/intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "../../../intelligence/intelligenceContext.js";
import { PROFANITY_MODULE, isProfanityEvidenceText } from "./profanityModule.js";
import { PROFANITY_EXAMPLES } from "./profanityExamples.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function createBuilderInput(evidenceText: string): IntelligenceBuilderInput {
  return {
    moduleId: PROFANITY_MODULE.id,
    storyMemory: "Story context is present.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "hostile",
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
          text: evidenceText,
          startOffset: 12,
          endOffset: 12 + evidenceText.length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    }),
    semantic: {
      semanticMeaning: "Direct profanity is present in the evidence.",
      narrativeIntent: "hostile",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "medium",
      confidence: 0.97,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: evidenceText,
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "Direct speech with literal content.",
      confidence: 0.95,
    }),
    glossary: { title: "Test glossary", entries: [] },
  };
}

function makeInput(builderInput: IntelligenceBuilderInput = createBuilderInput("يا كلب")): LegalModuleEvaluationInput {
  return {
    moduleId: PROFANITY_MODULE.id,
    intelligence: buildIntelligenceContext(builderInput),
  };
}

function evaluate(input: LegalModuleEvaluationInput) {
  const registry = new LegalModuleRegistry().register(PROFANITY_MODULE);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  return engine.evaluate(input);
}

function testDirectProfanity(): void {
  const decision = evaluate(makeInput(createBuilderInput("يا كلب")));
  assert(decision.status === "accept", "direct profanity should be accepted");
  assert(decision.finding !== null, "direct profanity should produce a finding");
  console.log("✓ direct profanity");
}

function testDirectExactProfanityPhrase(): void {
  const decision = evaluate(makeInput(createBuilderInput("كس امة")));
  assert(decision.status === "accept", "exact profanity phrase should be accepted");
  assert(decision.finding !== null, "exact profanity phrase should produce a finding");
  console.log("✓ direct exact profanity phrase");
}

function testQuotedProfanity(): void {
  const base = createBuilderInput("قال: «يا حمار»");
  const input = makeInput({
    ...base,
    narrative: {
      ...base.narrative,
      dialogue: false,
      narration: true,
      narrativeIntent: "quoted",
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
      sceneDescription: true,
      confidence: 0.9,
    },
    semantic: {
      ...base.semantic,
      semanticMeaning: "Quoted profanity appears in the evidence.",
      narrativeIntent: "quoted",
      sceneRole: "narration",
      confidence: 0.9,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: "قال: «يا حمار»",
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "The phrase is quoted rather than endorsed.",
      confidence: 0.9,
    }),
  });
  const decision = evaluate(input);
  assert(decision.status === "reject", "quoted profanity should be rejected");
  assert(decision.finding === null, "quoted profanity should not produce a finding");
  console.log("✓ quoted profanity");
}

function testEducationalDiscussion(): void {
  const base = createBuilderInput("في الدرس ندرس معنى كلمة شتيمة وأمثلة عليها.");
  const input = makeInput({
    ...base,
    semantic: {
      ...base.semantic,
      semanticMeaning: "The text explains profanity as a language topic.",
      narrativeIntent: "instruction",
      sceneRole: "educational",
      confidence: 0.88,
    },
    narrative: {
      ...base.narrative,
      narrativeVoice: "narration",
      sceneType: "instruction",
      narrativeIntent: "instruction",
      instruction: true,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.88,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: "في الدرس ندرس معنى كلمة شتيمة وأمثلة عليها.",
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "An educational explanation about profanity.",
      confidence: 0.9,
    }),
  });
  const decision = evaluate(input);
  assert(decision.status === "reject", "educational discussion should be rejected");
  assert(decision.finding === null, "educational discussion should not produce a finding");
  console.log("✓ educational discussion");
}

function testCondemnationOfProfanity(): void {
  const base = createBuilderInput("هذا لفظ مثل يا كلب قبيح ومرفوض ولا يجوز قوله.");
  const input = makeInput({
    ...base,
    semantic: {
      ...base.semantic,
      semanticMeaning: "The text condemns profanity by naming it and rejecting it.",
      narrativeIntent: "condemnation",
      sceneRole: "narration",
      confidence: 0.9,
    },
    narrative: {
      ...base.narrative,
      narrativeVoice: "narration",
      sceneType: "description scene",
      narrativeIntent: "condemnation",
      condemnation: true,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.9,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: "هذا لفظ مثل يا كلب قبيح ومرفوض ولا يجوز قوله.",
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "The phrase is clearly condemned.",
      confidence: 0.9,
    }),
  });
  const decision = evaluate(input);
  assert(decision.status === "reject", "condemnation should be rejected");
  assert(decision.finding === null, "condemnation should not produce a finding");
  console.log("✓ condemnation of profanity");
}

function testStoryNarrationContainingProfanity(): void {
  const base = createBuilderInput("في الرواية قال الرجل: يا كذاب.");
  const input = makeInput({
    ...base,
    narrative: {
      ...base.narrative,
      narrativeVoice: "third-person narration",
      sceneType: "narration",
      narrativeIntent: "exposition",
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.95,
    },
    semantic: {
      ...base.semantic,
      semanticMeaning: "Narration includes a direct profane utterance.",
      narrativeIntent: "narration",
      sceneRole: "narration",
      confidence: 0.95,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: "في الرواية قال الرجل: يا كذاب.",
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "Narration that contains direct profanity.",
      confidence: 0.95,
    }),
  });
  const decision = evaluate(input);
  assert(decision.status === "accept", "narration with profanity should be accepted");
  assert(decision.finding !== null, "narration with profanity should produce a finding");
  console.log("✓ story narration containing profanity");
}

function testDialogueContainingProfanity(): void {
  const decision = evaluate(makeInput(createBuilderInput("A: يا نصاب")));
  assert(decision.status === "accept", "dialogue profanity should be accepted");
  assert(decision.finding !== null, "dialogue profanity should produce a finding");
  console.log("✓ dialogue containing profanity");
}

function testNoProfanity(): void {
  const base = createBuilderInput("جلسوا يتحدثون بهدوء عن العمل.");
  const input = makeInput({
    ...base,
    semantic: {
      ...base.semantic,
      semanticMeaning: "Neutral conversation with no profanity.",
      narrativeIntent: "neutral",
      conversationRole: "narrator",
      sceneRole: "narration",
      speaker: "Narrator",
      listener: null,
      target: null,
      victim: null,
      emotion: "neutral",
      riskContext: "low",
      confidence: 0.98,
    },
    narrative: {
      ...base.narrative,
      narrativeIntent: "neutral description",
      emotionalTone: "neutral",
      condemnation: false,
      approval: false,
      neutrality: true,
      dialogue: false,
      narration: true,
      sceneDescription: true,
      confidence: 0.98,
    },
    context: createLegalContextResult({
      storyMemory: "Story context is present.",
      sceneMemory: "Scene memory is present.",
      localContext: "جلسوا يتحدثون بهدوء عن العمل.",
      chunkContext: "Chunk context is present.",
      neighboringSentences: ["Before sentence.", "After sentence."],
      narrativeContext: "Neutral conversation without profanity.",
      confidence: 0.98,
    }),
    evidence: createLegalEvidenceResult({
      candidates: [
        {
          text: "جلسوا يتحدثون بهدوء عن العمل.",
          startOffset: 12,
          endOffset: 12 + "جلسوا يتحدثون بهدوء عن العمل.".length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    }),
  });
  const decision = evaluate(input);
  assert(decision.status === "reject", "no profanity should be rejected");
  assert(decision.finding === null, "no profanity should not produce a finding");
  console.log("✓ no profanity");
}

function testDeterministicOutput(): void {
  const first = evaluate(makeInput(createBuilderInput("يا كلب")));
  const second = evaluate(makeInput(createBuilderInput("يا كلب")));
  assert(JSON.stringify(first) === JSON.stringify(second), "same input should produce same decision");
  console.log("✓ deterministic output");
}

function testRulesAndExamples(): void {
  assert(PROFANITY_MODULE.id === "v4_11_profanity", "module id should be v4_11_profanity");
  assert(isProfanityEvidenceText("يا كلب"), "helper should recognize profanity");
  assert(!isProfanityEvidenceText("جلسوا يتحدثون بهدوء"), "helper should reject neutral text");
  assert(PROFANITY_EXAMPLES.length >= 7, "example catalog should be present");
  console.log("✓ rules and examples catalog");
}

async function main(): Promise<void> {
  testRulesAndExamples();
  testDirectProfanity();
  testDirectExactProfanityPhrase();
  testQuotedProfanity();
  testEducationalDiscussion();
  testCondemnationOfProfanity();
  testStoryNarrationContainingProfanity();
  testDialogueContainingProfanity();
  testNoProfanity();
  testDeterministicOutput();
  console.log("\nAll profanity module tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
