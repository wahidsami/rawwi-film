/**
 * Tests for the executable V3 legal module framework.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/legal/legalEngine.test.ts
 */
import { createLegalDecision, finalizeLegalDecision } from "./legalDecision.js";
import type { LegalModule, LegalModuleEvaluationInput } from "./legalModule.js";
import { createLegalEngine } from "./legalEngine.js";
import { createLegalModuleLoader } from "./legalModuleLoader.js";
import { LegalModuleRegistry } from "./legalModuleRegistry.js";
import { createLegalExceptionResult, createLegalFinding } from "./legalResult.js";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInput(): LegalModuleEvaluationInput {
  const intelligence = buildIntelligenceContext({
    moduleId: "v3_mock_subject",
    storyMemory: "This is a confrontation scene.",
    narrative: {
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "threat",
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
      confidence: 0.96,
      notes: ["narrative is deterministic"],
    },
    evidence: {
      candidates: [
        {
          text: "سأضرك إن لم تتوقف",
          startOffset: 15,
          endOffset: 31,
          confidence: 0.98,
          source: "chunk",
          notes: ["literal span"],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.95,
      notes: ["evidence is deterministic"],
    },
    semantic: {
      semanticMeaning: "A direct hostile statement in dialogue.",
      narrativeIntent: "threat",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "Character A",
      listener: "Character B",
      target: "Character B",
      victim: "Character B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.97,
      notes: ["semantic is deterministic"],
    },
    context: {
      storyMemory: "This is a confrontation scene.",
      sceneMemory: "Interior, late evening.",
      localContext: "A threatens B in direct dialogue.",
      chunkContext: "Chunk 3, scene 12.",
      neighboringSentences: ["Before: They argue.", "After: B steps back."],
      narrativeContext: "A direct confrontation in dialogue.",
      confidence: 0.95,
      notes: ["context is deterministic"],
    },
    glossary: { title: "Test glossary", entries: [] },
  });
  return {
    moduleId: "v3_mock_subject",
    intelligence,
  };
}

const mockModule: LegalModule = {
  id: "v3_mock_subject",
  title: "Mock Legal Module",
  articleIds: [12, 19],
  applies(input) {
    return input.intelligence.evidence.admissible && input.intelligence.semantic.semanticMeaning.length > 0;
  },
  evaluate(input) {
    const confidence = Number(
      Math.min(
        input.intelligence.semantic.confidence,
        input.intelligence.evidence.confidence,
        input.intelligence.context.confidence,
      ).toFixed(6),
    );
    const status = confidence >= 0.9 ? "accept" : confidence >= 0.6 ? "needs_review" : "reject";

    return createLegalDecision({
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds: [...this.articleIds],
      applies: true,
      status,
      reason: `Mock evaluation completed with status ${status}.`,
      confidence,
      semantic: input.intelligence.semantic,
      narrative: input.intelligence.narrative,
      evidence: input.intelligence.evidence,
      context: input.intelligence.context,
      exceptions: [],
      finding: null,
      trace: ["mock:evaluate"],
    });
  },
  exceptions(input, decision) {
    return [
      createLegalExceptionResult({
        code: "historical-quotation",
        label: "Historical quotation",
        applies: input.intelligence.narrative.historicalContext === true,
        disposition: "allow",
        reason: "Narrative is historical quotation.",
        confidence: 0.8,
      }),
      createLegalExceptionResult({
        code: "low-confidence",
        label: "Low confidence",
        applies: decision.confidence < 0.6,
        disposition: "block",
        reason: "Confidence below operational floor.",
        confidence: 0.95,
      }),
    ];
  },
  buildFinding(input, decision, exceptions) {
    const primary = input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex];
    return createLegalFinding({
      findingKey: `${this.id}:${primary.startOffset}-${primary.endOffset}:${decision.status}`,
      moduleId: this.id,
      moduleTitle: this.title,
      articleIds: [...this.articleIds],
      status: decision.status,
      reason: decision.reason,
      confidence: decision.confidence,
      semantic: input.intelligence.semantic,
      narrative: input.intelligence.narrative,
      evidence: primary,
      context: input.intelligence.context,
      exceptionCodes: exceptions.filter((exception) => exception.applies).map((exception) => exception.code),
    });
  },
};

function testRegistryOperations(): void {
  const registry = new LegalModuleRegistry();
  assert(registry.list().length === 0, "registry starts empty");

  registry.register(mockModule);
  assert(registry.load(mockModule.id) === mockModule, "registered module should load");
  assert(registry.list().length === 1, "registry list should include module");
  assert(registry.list()[0].id === mockModule.id, "registry list should be sorted and stable");

  assert(registry.unregister(mockModule.id) === true, "unregister should return true for existing module");
  assert(registry.load(mockModule.id) === null, "module should be removed after unregister");
  assert(registry.unregister("missing") === false, "unregister should return false for missing module");
  console.log("✓ registry register/load/list/unregister works");
}

function testLoaderOperations(): void {
  const registry = new LegalModuleRegistry().register(mockModule);
  const loader = createLegalModuleLoader(registry);

  assert(loader.load(mockModule.id) === mockModule, "loader should load registered module");
  assert(loader.loadRequired(mockModule.id) === mockModule, "loadRequired should return the module");

  let threw = false;
  try {
    loader.loadRequired("missing-module");
  } catch {
    threw = true;
  }
  assert(threw, "loadRequired should throw for missing module");
  console.log("✓ module loader resolves registered modules");
}

function testEvaluationFlow(): void {
  const registry = new LegalModuleRegistry().register(mockModule);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  const decision = engine.evaluate(makeInput());

  assert(decision.moduleId === mockModule.id, "decision should carry module id");
  assert(decision.status === "accept", "decision should be accepted for high-confidence input");
  assert(decision.finding !== null, "decision should include a finding");
  assert(decision.exceptions.length === 2, "decision should include both exceptions");
  assert(decision.finding?.findingKey === "v3_mock_subject:15-31:accept", "finding key should be deterministic");
  console.log("✓ legal engine evaluates module input into a deterministic decision");
}

function testDeterministicOutput(): void {
  const registry = new LegalModuleRegistry().register(mockModule);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  const first = engine.evaluate(makeInput());
  const second = engine.evaluate(makeInput());

  assert(JSON.stringify(first) === JSON.stringify(second), "same input should produce same output");
  assert(JSON.stringify(finalizeLegalDecision(first)) === JSON.stringify(first), "finalization should be idempotent");
  console.log("✓ legal engine output is deterministic");
}

async function main(): Promise<void> {
  testRegistryOperations();
  testLoaderOperations();
  testEvaluationFlow();
  testDeterministicOutput();
  console.log("\nAll legal engine tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
