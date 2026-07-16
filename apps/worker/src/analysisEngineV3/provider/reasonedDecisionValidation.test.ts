import { strict as assert } from "node:assert";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { validateReasonedDecisionAgainstEvidence } from "./reasonedDecisionValidation.js";

function makePromptInput(): V3PromptBuilderInput {
  return {
    reasoningContract: { title: "Reasoning", stages: [] },
    decisionGraph: { title: "Decision", nodes: [] },
    semanticLayer: { title: "Semantic" },
    storyMemory: "A memory that is present but should not be required.",
    chunkContext: {
      localChunk: "أنت كذاب",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      sceneMemory: "A dialogue scene.",
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      articleIds: [4, 5, 17],
    },
    glossary: { title: "Glossary", entries: [] },
    outputSchema: { title: "Output", fields: [] },
  } as V3PromptBuilderInput;
}

function main(): void {
  const input = makePromptInput();
  const validation = validateReasonedDecisionAgainstEvidence(input, {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
      narrativeIntent: "attack",
      storyPosition: "middle",
      relationship: null,
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "أنت كذاب",
          startOffset: 0,
          endOffset: 8,
          confidence: 0.98,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "أنت كذاب",
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "The quote is enough to know that a prince was murdered in the palace.",
      alternativeInterpretations: ["Could be metaphorical."],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 4, status: "PASS", evidence: ["أنت كذاب"], reason: "The quote supports the conclusion.", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "Direct dialogue.",
      humanLikeExplanation: "A human reviewer would not invent a prince or murder from this quote.",
      recommendation: "RETURN VIOLATION",
    },
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.length > 0, true);
  assert.equal(validation.sanitizedDecision.reasoning, "NO VIOLATION");
  console.log("✓ reasoned decision grounding validator rejects hallucinated explanations");
}

main();
