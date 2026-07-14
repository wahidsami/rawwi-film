/**
 * Tests for the V3 reasoning pipeline.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/pipeline/reasoningPipeline.test.ts
 */
import { runV3ReasoningPipeline } from "./reasoningPipeline.js";
import { PROFANITY_MODULE } from "../legal/modules/profanity/profanityModule.js";
import { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInput(text: string) {
  return {
    moduleId: PROFANITY_MODULE.id,
    chunk: {
      text,
      startOffset: 100,
      endOffset: 100 + text.length,
      chunkIndex: 2,
      storyMemory: "A conflict is unfolding.",
      sceneMemory: "Late evening in a living room.",
      neighboringSentences: ["Before: they argued.", "After: silence returned."],
      metadata: { scriptId: "script-1", versionId: "version-1" },
    },
    glossary: { title: "Test glossary", entries: [] },
    registry: new LegalModuleRegistry().register(PROFANITY_MODULE),
    diagnostics: { enabled: false },
  };
}

function testStageOrder(): void {
  const result = runV3ReasoningPipeline(makeInput("A: يا كلب"));
  assert(JSON.stringify(result.stageTrace) === JSON.stringify(["narrative", "evidence", "semantic", "context", "intelligence", "legal"]), "stage order should be fixed");
  console.log("✓ stage execution order");
}

function testDeterministicOutputs(): void {
  const first = runV3ReasoningPipeline(makeInput("A: يا كلب"));
  const second = runV3ReasoningPipeline(makeInput("A: يا كلب"));
  assert(JSON.stringify(first) === JSON.stringify(second), "identical inputs should produce identical pipeline results");
  console.log("✓ deterministic outputs");
}

function testReasoningPropagation(): void {
  const result = runV3ReasoningPipeline(makeInput("A: يا كلب"));
  assert(result.legalDecision.semantic === result.semantic, "semantic object should propagate into legal decision");
  assert(result.legalDecision.narrative === result.narrative, "narrative object should propagate into legal decision");
  assert(result.legalDecision.evidence === result.evidence, "evidence object should propagate into legal decision");
  assert(result.legalDecision.context === result.context, "context object should propagate into legal decision");
  assert(result.intelligence.semantic === result.semantic, "intelligence should embed semantic result");
  console.log("✓ reasoning object propagation");
}

function testImmutability(): void {
  const result = runV3ReasoningPipeline(makeInput("A: يا كلب"));
  let threw = false;
  try {
    (result.narrative as { narrativeIntent?: string }).narrativeIntent = "mutated";
  } catch {
    threw = true;
  }
  assert(threw || result.narrative.narrativeIntent !== "mutated", "narrative output should be immutable");
  console.log("✓ immutable stage outputs");
}

async function main(): Promise<void> {
  testStageOrder();
  testDeterministicOutputs();
  testReasoningPropagation();
  testImmutability();
  console.log("\nAll V3 reasoning pipeline tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
