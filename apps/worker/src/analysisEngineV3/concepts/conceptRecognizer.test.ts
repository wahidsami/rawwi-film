/**
 * Tests for the V3 concept recognition engine.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/concepts/conceptRecognizer.test.ts
 */
import { createConceptRecognizer } from "./conceptRecognizer.js";
import { createDefaultConceptRegistry, ConceptRegistry } from "./conceptRegistry.js";
import type { IntelligenceBuilderInput } from "../intelligence/intelligenceContext.js";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInput(text = "A: يا كلب ويتحدث عن القمار والخمر"): IntelligenceBuilderInput {
  return {
    moduleId: "v4_11_profanity",
    storyMemory: "The scene also mentions gambling and alcohol.",
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
      threat: true,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.95,
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
      semanticMeaning: "A profane threat mentioning gambling and alcohol.",
      narrativeIntent: "threat",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.96,
    },
    context: {
      storyMemory: "The scene also mentions gambling and alcohol.",
      sceneMemory: "Interior at night.",
      localContext: text,
      chunkContext: "Scene 5, chunk 1.",
      neighboringSentences: ["Before: they argued.", "After: someone left."],
      narrativeContext: "Dialogue with profanity, gambling, and alcohol.",
      confidence: 0.94,
    },
    glossary: {
      title: "Test glossary",
      entries: [
        { term: "خمر", articleId: 10, variants: ["خمر"], definition: "Alcohol term." },
        { term: "قمار", articleId: 10, variants: ["قمار"], definition: "Gambling term." },
      ],
      notes: ["Synthetic glossary for tests."],
    },
  };
}

function testConceptRecognition(): void {
  const recognizer = createConceptRecognizer(createDefaultConceptRegistry());
  const context = recognizer.recognize(buildIntelligenceContext(makeInput()));

  assert(context.conceptIds.includes("profanity"), "profanity concept should be recognized");
  assert(context.conceptIds.includes("gambling"), "gambling concept should be recognized");
  assert(context.conceptIds.includes("alcohol"), "alcohol concept should be recognized");
  assert(context.conceptCount === context.concepts.length, "concept count should match concepts length");
  assert(context.concepts[0].confidence.total >= context.concepts[context.concepts.length - 1].confidence.total, "concepts should be sorted deterministically");
  assert(context.concepts.some((concept) => concept.evidenceSources.length > 0), "concepts should preserve evidence sources");
  assert(context.concepts.some((concept) => concept.originatingSentences.length > 0), "concepts should preserve originating sentences");
  console.log("✓ concept recognition");
}

function testArabicProfanityFallbackRecognition(): void {
  const recognizer = createConceptRecognizer(createDefaultConceptRegistry());
  const context = recognizer.recognize(buildIntelligenceContext(makeInput("حاضر. فهد يتمتم بشتائم: يا… موتو وخلصوني منكم")));

  assert(context.conceptIds.includes("profanity"), "Arabic profanity fallback should recognize profanity");
  console.log("✓ arabic profanity fallback recognition");
}

function testDuplicateMerging(): void {
  const registry = new ConceptRegistry([
    { id: "violence", label: "Violence", aliases: ["سأضرب", "ضرب", "threat"] },
  ]);
  const recognizer = createConceptRecognizer(registry);
  const context = recognizer.recognize(buildIntelligenceContext(makeInput("سأضربك يا كلب")));

  assert(context.conceptIds.length === 1, "duplicate concept ids should merge");
  assert(context.primaryConceptId === "violence", "primary concept should be violence");
  assert(context.concepts[0].evidenceSources.length >= 2, "merged concept should preserve multiple evidence sources");
  console.log("✓ duplicate concept merging");
}

function testStoryMemoryContributesRecognition(): void {
  const input = makeInput("Hello there");
  const storyMemoryText = "Earlier scene mentions gambling and alcohol.";
  const recognizer = createConceptRecognizer(createDefaultConceptRegistry());
  const context = recognizer.recognize(buildIntelligenceContext({
    ...input,
    storyMemory: storyMemoryText,
    evidence: {
      ...input.evidence,
      candidates: [
        {
          ...input.evidence.candidates[0],
          text: "Hello there",
        },
      ],
    },
    semantic: {
      ...input.semantic,
      semanticMeaning: "Hello there",
    },
    context: {
      ...input.context,
      storyMemory: storyMemoryText,
      sceneMemory: storyMemoryText,
      localContext: "Hello there",
      narrativeContext: storyMemoryText,
    },
  }));

  assert(context.conceptIds.includes("gambling"), "story memory should contribute gambling recognition");
  assert(context.conceptIds.includes("alcohol"), "story memory should contribute alcohol recognition");
  console.log("✓ story memory contributes concept recognition");
}

function testDeterministicOutput(): void {
  const recognizer = createConceptRecognizer(createDefaultConceptRegistry());
  const first = recognizer.recognize(buildIntelligenceContext(makeInput()));
  const second = recognizer.recognize(buildIntelligenceContext(makeInput()));
  assert(JSON.stringify(first) === JSON.stringify(second), "identical input should produce identical concept context");
  console.log("✓ deterministic concept output");
}

async function main(): Promise<void> {
  testConceptRecognition();
  testArabicProfanityFallbackRecognition();
  testDuplicateMerging();
  testStoryMemoryContributesRecognition();
  testDeterministicOutput();
  console.log("\nAll concept recognizer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
