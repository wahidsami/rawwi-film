/**
 * Tests for the V3 provider abstraction and response mapper.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/provider/provider.test.ts
 */
import { strict as assert } from "node:assert";
import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { createV3ProviderFactory } from "./providerFactory.js";
import { mapV3ProviderResponse, type V3ProviderResponseParseAudit } from "./responseMapper.js";
import { runV3ProviderReasoning, type V3Provider } from "./provider.js";

function makeInput(): V3PromptBuilderInput {
  return {
    reasoningContract: {
      title: "Reasoning Contract",
      stages: [
        { key: "narrative", title: "Narrative Understanding", purpose: "Understand the story before judging." },
      ],
    },
    decisionGraph: {
      title: "Decision Graph",
      nodes: [
        { id: "narrative", type: "narrative", title: "Narrative Node", purpose: "Understand narrative meaning." },
      ],
    },
    semanticLayer: {
      title: "Semantic Layer",
      meaningQuestions: ["Who is speaking?"],
      outputs: ["Semantic Meaning"],
    },
    storyMemory: "A tense argument is unfolding.",
    chunkContext: {
      localChunk: "A: damn, stop that.",
      neighboringSentences: ["Before: they were calm.", "After: the room fell silent."],
      sceneMemory: "Interior, evening.",
      metadata: { chunkIndex: 1 },
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      articleIds: [4, 5, 17],
    },
    glossary: {
      title: "Glossary",
      entries: [{ term: "damn", articleId: 4 }],
    },
    outputSchema: {
      title: "Output Contract",
      fields: [{ name: "semantic", description: "Semantic result" }],
    },
  };
}

function testResponseMapper(): void {
  const mapped = mapV3ProviderResponse(
    JSON.stringify({
      reasoning: {
        narrative: {
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          narrativeVoice: "dialogue",
          sceneType: "dialogue scene",
          narrativeIntent: "dialogue",
          storyPosition: "opening",
          relationship: "peer",
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
          confidence: 0.91,
          notes: ["synthetic"],
        },
        evidence: {
          candidates: [{ text: "damn", startOffset: 10, endOffset: 14, confidence: 0.99, source: "chunk" }],
          primaryCandidateIndex: 0,
          admissible: true,
          confidence: 0.99,
          notes: [],
        },
        semantic: {
          semanticMeaning: "The evidence is direct dialogue.",
          narrativeIntent: "dialogue",
          conversationRole: "speaker",
          sceneRole: "dialogue scene",
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          victim: "listener",
          emotion: "neutral",
          riskContext: "medium",
          confidence: 0.9,
          notes: [],
        },
        context: {
          storyMemory: "Memory",
          sceneMemory: "Scene",
          localContext: "A: damn, stop that.",
          chunkContext: "chunk_index=1",
          neighboringSentences: ["Before", "After"],
          narrativeContext: "dialogue",
          confidence: 0.88,
          notes: [],
        },
        reasoned_decision: {
          reasoning: "The line is explicit profanity.",
          alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
          article_evaluations: [
            { article_id: 4, status: "PASS", evidence: ["damn"], reason: "Exact quote supports the article.", confidence: 0.94 },
            { article_id: 17, status: "FAIL", evidence: ["damn"], reason: "Different article does not fit the quote.", confidence: 0.94 },
          ],
          supporting_evidence: ["damn"],
          contradicting_evidence: [],
          applicable_articles: [4],
          rejected_articles: [17],
          risk_analysis: "Low risk because the evidence is direct.",
          narrative_analysis: "Direct dialogue with no exception cues.",
          human_like_explanation: "A human reviewer would treat this as a straightforward profanity case.",
          recommendation: "Support the finding while keeping the legal engine authoritative.",
          confidence: 0.94,
        },
      },
    }),
  );

  assert.equal(mapped.narrative.dialogue, true);
  assert.equal(mapped.evidence.candidates[0]?.text, "damn");
  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 2);
  assert.equal(mapped.reasonedDecision.articleEvaluations[0]?.status, "PASS");
  assert.equal(mapped.semantic.semanticMeaning, "The evidence is direct dialogue.");
  assert.equal(mapped.context.neighboringSentences.length, 2);
  assert.equal(mapped.reasonedDecision.reasoning, "The line is explicit profanity.");
  assert.equal(mapped.reasonedDecision.recommendation, "Support the finding while keeping the legal engine authoritative.");
  console.log("✓ response mapper normalizes GPT JSON");
}

function testResponseMapperReportsDiscardedViolations(): void {
  let parseAudit: V3ProviderResponseParseAudit | null = null;
  const mapped = mapV3ProviderResponse(
    JSON.stringify({
      reasoning: {
        narrative: {
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          narrativeVoice: "dialogue",
          sceneType: "dialogue scene",
          narrativeIntent: "dialogue",
          storyPosition: "opening",
          relationship: "peer",
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
          confidence: 0.91,
        },
        evidence: {
          candidates: [{ text: "damn", startOffset: 10, endOffset: 14, confidence: 0.99, source: "chunk" }],
          primaryCandidateIndex: 0,
          admissible: true,
          confidence: 0.99,
        },
        semantic: {
          semanticMeaning: "The evidence is direct dialogue.",
          narrativeIntent: "dialogue",
          conversationRole: "speaker",
          sceneRole: "dialogue scene",
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          victim: "listener",
          emotion: "neutral",
          riskContext: "medium",
          confidence: 0.9,
        },
        context: {
          storyMemory: "Memory",
          sceneMemory: "Scene",
          localContext: "A: damn, stop that.",
          chunkContext: "chunk_index=1",
          neighboringSentences: ["Before", "After"],
          narrativeContext: "dialogue",
          confidence: 0.88,
        },
        reasoned_decision: {
          reasoning: "The line is explicit profanity.",
          alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
          article_evaluations: [
            { article_id: 4, status: "PASS", evidence: ["damn"], reason: "Exact quote supports the article.", confidence: 0.94 },
          ],
          supporting_evidence: ["damn"],
          contradicting_evidence: [],
          applicable_articles: [4],
          rejected_articles: [],
          risk_analysis: "Low risk because the evidence is direct.",
          narrative_analysis: "Direct dialogue with no exception cues.",
          human_like_explanation: "A human reviewer would treat this as a straightforward profanity case.",
          recommendation: "Support the finding while keeping the legal engine authoritative.",
          confidence: 0.94,
          violations: [
            {
              offending_sentence: "invented sentence",
              reason: "invented reason",
              policy_category: "invented category",
            },
          ],
        },
        violations: [
          {
            offending_sentence: "invented sentence",
            reason: "invented reason",
            policy_category: "invented category",
          },
        ],
      },
      unexpected_root_field: {
        will_be_discarded: true,
      },
    }),
    {
      onAudit: (audit) => {
        parseAudit = audit;
      },
    },
  );

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 1);
  if (!parseAudit) throw new Error("parse audit should be captured");
  const audit = parseAudit as any;
  assert.equal(audit.parserInput.payloadSource, "reasoning");
  assert.equal(audit.parserInput.parseStrategy, "reasoning");
  assert.equal(audit.parserInput.fallbackParserUsed, false);
  assert(audit.discardedFields.some((field: { path: string }) => field.path === "root.unexpected_root_field"));
  assert(audit.discardedFields.some((field: { path: string }) => field.path === "reasoning.violations"));
  assert(audit.discardedFields.some((field: { path: string }) => field.path === "reasonedDecision.violations"));
  assert.equal(audit.zeroFindingsReason, null);
  assert.equal(audit.parsedFindingCount, 1);
  console.log("✓ response mapper records discarded non-schema violation fields");
}

function testResponseMapperReportsParseFailure(): void {
  let parseAudit: V3ProviderResponseParseAudit | null = null;
  const mapped = mapV3ProviderResponse("not valid json", {
    onAudit: (audit) => {
      parseAudit = audit;
    },
  });

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 0);
  if (!parseAudit) throw new Error("parse audit should be captured");
  const audit = parseAudit as any;
  assert.equal(audit.parseErrors.length, 2);
  assert.equal(audit.parserInput.fallbackParserUsed, false);
  assert.equal(audit.parserInput.parseStrategy, "root");
  assert.equal(audit.parsedFindingCount, 0);
  assert.equal(typeof audit.parseFailure?.message, "string");
  assert(audit.parseErrors.some((entry: string) => entry.includes("Parse abort location")));
  assert.equal(audit.zeroFindingsReason, "JSON parsing failed; no provider decision could be recovered.");
  console.log("✓ response mapper records parse failures");
}

async function testProviderFlowWithMockProvider(): Promise<void> {
  const input = makeInput();
  const provider: V3Provider = {
    name: "openai",
    async callJudgeRaw() {
      return {
        providerName: "openai",
        modelName: "test-model",
        modelVersion: null,
        rawResponse: JSON.stringify({
          narrative: { narrativeVoice: "dialogue", sceneType: "dialogue scene", narrativeIntent: "dialogue", emotionalTone: "neutral", condemnation: false, approval: false, neutrality: true, historicalContext: false, dream: false, flashback: false, comedy: false, satire: false, threat: false, instruction: false, news: false, documentary: false, dialogue: true, narration: false, sceneDescription: false, confidence: 0.9 },
          evidence: { candidates: [{ text: "damn", startOffset: 10, endOffset: 14, confidence: 0.99, source: "chunk" }], primaryCandidateIndex: 0, admissible: true, confidence: 0.99 },
          semantic: { semanticMeaning: "direct dialogue", narrativeIntent: "dialogue", conversationRole: "speaker", sceneRole: "dialogue scene", emotion: "neutral", riskContext: "medium", confidence: 0.9 },
          context: { localContext: "A: damn, stop that.", chunkContext: "chunk_index=1", neighboringSentences: ["Before", "After"], narrativeContext: "dialogue", confidence: 0.88 },
          reasoned_decision: {
            reasoning: "The line is explicit profanity.",
            alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
            article_evaluations: [
              { article_id: 4, status: "PASS", evidence: ["damn"], reason: "Exact quote supports the article.", confidence: 0.94 },
              { article_id: 17, status: "FAIL", evidence: ["damn"], reason: "Different article does not fit the quote.", confidence: 0.94 },
            ],
            supporting_evidence: ["damn"],
            contradicting_evidence: [],
            applicable_articles: [4],
            rejected_articles: [17],
            risk_analysis: "Low risk because the evidence is direct.",
            narrative_analysis: "Direct dialogue with no exception cues.",
            human_like_explanation: "A human reviewer would treat this as a straightforward profanity case.",
            recommendation: "Support the finding while keeping the legal engine authoritative.",
            confidence: 0.94,
          },
        }),
        finishReason: "stop",
        usage: null,
        responseId: "resp_123",
        responseTimestamp: "2026-07-12T00:00:00.000Z",
      };
    },
  };

  const result = await runV3ProviderReasoning({
    promptInput: input,
    provider,
    modelName: "test-model",
    temperature: 0,
    seed: 12345,
  });

  assert.equal(result.promptHash, buildV3RenderedPrompt(input).promptHash);
  assert.equal(result.narrative.dialogue, true);
  assert.equal(result.evidence.candidates[0]?.text, "damn");
  assert.equal(result.reasonedDecision.reasoning, "The line is explicit profanity.");
  assert.equal(result.reasonedDecision.recommendation, "Support the finding while keeping the legal engine authoritative.");
  assert.equal(result.rawResponse.responseId, "resp_123");
  console.log("✓ provider flow uses the abstraction and preserves hashes");
}

async function testProviderRepairsInvalidReasonedDecision(): Promise<void> {
  const input = makeInput();
  let callCount = 0;
  const provider: V3Provider = {
    name: "openai",
    async callJudgeRaw() {
      callCount += 1;
      const validResponse = {
        narrative: {
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          narrativeVoice: "dialogue",
          sceneType: "dialogue scene",
          narrativeIntent: "dialogue",
          storyPosition: "opening",
          relationship: "peer",
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
          confidence: 0.91,
        },
        evidence: {
          candidates: [{ text: "damn", quote: "damn", startOffset: 10, endOffset: 14, offsetStart: 10, offsetEnd: 14, confidence: 0.99, source: "chunk", concepts: [], entities: [], reason: "Exact quote." }],
          primaryCandidateIndex: 0,
          admissible: true,
          confidence: 0.99,
        },
        semantic: {
          semanticMeaning: "direct dialogue",
          narrativeIntent: "dialogue",
          conversationRole: "speaker",
          sceneRole: "dialogue scene",
          speaker: "speaker",
          listener: "listener",
          target: "listener",
          victim: "listener",
          emotion: "neutral",
          riskContext: "medium",
          confidence: 0.9,
        },
        context: {
          storyMemory: "Memory",
          sceneMemory: "Scene",
          localContext: "A: damn, stop that.",
          chunkContext: "chunk_index=1",
          neighboringSentences: ["Before", "After"],
          narrativeContext: "dialogue",
          confidence: 0.88,
        },
          reasoned_decision: {
            reasoning: "The quote directly supports the semantic conclusion.",
            alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
            article_evaluations: [
              { article_id: 4, status: "PASS", evidence: ["damn"], reason: "Exact quote supports the article.", confidence: 0.94 },
              { article_id: 17, status: "FAIL", evidence: ["damn"], reason: "Different article does not fit the quote.", confidence: 0.94 },
            ],
            supporting_evidence: ["damn"],
            contradicting_evidence: [],
            applicable_articles: [4],
          rejected_articles: [17],
          risk_analysis: "Low risk because the evidence is direct.",
          narrative_analysis: "Direct dialogue with no exception cues.",
          human_like_explanation: "A human reviewer would treat this as a straightforward profanity case.",
          recommendation: "Support the finding while keeping the legal engine authoritative.",
          confidence: 0.94,
        },
      };

      const invalidResponse = {
        ...validResponse,
        reasoned_decision: {
          ...validResponse.reasoned_decision,
          supporting_evidence: ["invented actor attacked the mayor"],
          applicable_articles: [4, 16],
          recommendation: "Support the finding while keeping the legal engine authoritative.",
        },
      };

      return {
        providerName: "openai",
        modelName: "test-model",
        modelVersion: null,
        rawResponse: JSON.stringify(callCount === 1 ? invalidResponse : validResponse),
        finishReason: "stop",
        usage: null,
        responseId: callCount === 1 ? "resp_invalid" : "resp_valid",
        responseTimestamp: "2026-07-12T00:00:00.000Z",
      };
    },
  };

  const result = await runV3ProviderReasoning({
    promptInput: input,
    provider,
    modelName: "test-model",
    temperature: 0,
    seed: 12345,
  });

  assert.equal(callCount, 2, "provider should retry once after validation failure");
  assert.equal(result.reasonedDecision.applicableArticles.length, 1);
  assert.equal(result.reasonedDecision.applicableArticles[0], 4);
  assert.equal(result.rawResponse.responseId, "resp_valid");
  assert.equal(result.reasonedDecision.recommendation, "Support the finding while keeping the legal engine authoritative.");
  console.log("✓ provider regenerates when the reviewer response is not grounded");
}

function testFactoryCreatesOpenAIProvider(): void {
  const provider = createV3ProviderFactory().create("openai");
  assert.equal(provider.name, "openai");
  console.log("✓ provider factory creates an OpenAI provider");
}

async function main(): Promise<void> {
  testResponseMapper();
  testResponseMapperReportsDiscardedViolations();
  testResponseMapperReportsParseFailure();
  await testProviderFlowWithMockProvider();
  await testProviderRepairsInvalidReasonedDecision();
  testFactoryCreatesOpenAIProvider();
  console.log("\nAll V3 provider tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
