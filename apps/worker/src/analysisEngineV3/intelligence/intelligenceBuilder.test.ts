/**
 * Tests for the V3 IntelligenceContext builder.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/intelligence/intelligenceBuilder.test.ts
 */
import { buildIntelligenceContext } from "./intelligenceBuilder.js";
import type { IntelligenceBuilderInput } from "./intelligenceContext.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInput(text = "A: يا كلب"): IntelligenceBuilderInput {
  return {
    moduleId: "v4_11_profanity",
    storyMemory: "A hostile confrontation is unfolding.",
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
    evidence: {
      candidates: [
        {
          text,
          startOffset: 10,
          endOffset: 10 + text.length,
          confidence: 0.99,
          source: "chunk",
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
    },
    semantic: {
      semanticMeaning: "Literal profanity is present.",
      narrativeIntent: "hostile",
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
    context: {
      storyMemory: "A hostile confrontation is unfolding.",
      sceneMemory: "Interior at night.",
      localContext: text,
      chunkContext: "Scene 4, chunk 2.",
      neighboringSentences: ["Before: they argued.", "After: silence."],
      narrativeContext: "Direct speech with literal content.",
      confidence: 0.95,
    },
    glossary: {
      title: "Test glossary",
      entries: [
        {
          term: "كلب",
          articleId: 4,
          variants: ["كلب", "كلاب"],
          definition: "Example profane term.",
        },
      ],
      notes: ["Synthetic glossary for tests."],
    },
  };
}

function testDeterministicOutput(): void {
  const first = buildIntelligenceContext(makeInput());
  const second = buildIntelligenceContext(makeInput());
  assert(JSON.stringify(first) === JSON.stringify(second), "identical input should produce identical intelligence context");
  assert(Object.isFrozen(first), "intelligence context should be frozen");
  assert(Object.isFrozen(first.narrative), "narrative object should be frozen");
  assert(Object.isFrozen(first.evidence), "evidence object should be frozen");
  assert(Object.isFrozen(first.semantic), "semantic object should be frozen");
  assert(Object.isFrozen(first.context), "context object should be frozen");
  assert(Object.isFrozen(first.glossary), "glossary object should be frozen");
  assert(Object.isFrozen(first.conceptContext), "concept context should be frozen");
  assert(first.entities.every((entity) => Object.isFrozen(entity)), "entities should be frozen");
  assert(first.glossaryReferences.every((reference) => Object.isFrozen(reference)), "glossary references should be frozen");
  console.log("✓ deterministic intelligence output");
}

function testGlossaryAndEntities(): void {
  const context = buildIntelligenceContext(makeInput());
  assert(context.glossaryReferences.length > 0, "glossary references should be captured");
  assert(context.legalConcepts.includes("profanity"), "legal concepts should include profanity");
  assert(context.conceptContext.conceptIds.length > 0, "concept context should contain concepts");
  assert(context.entities.some((entity) => entity.role === "speaker"), "speaker entity should be derived");
  console.log("✓ glossary, concepts, and entities");
}

async function main(): Promise<void> {
  testDeterministicOutput();
  testGlossaryAndEntities();
  console.log("\nAll intelligence builder tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
