import { strict as assert } from "node:assert";

import { analyzeV3ReasoningTrace, renderV3ReasoningReplayAnalysis } from "./reasoningAnalyzer.js";
import type { V3ReasoningTraceFinding } from "./reasoningTypes.js";

function makeCandidate(
  id: string,
  label: string,
  score: number,
  selected: boolean,
  reasons: readonly string[],
): V3ReasoningTraceFinding["reviewerCandidates"][number] {
  return Object.freeze({
    id,
    label,
    score,
    confidence: score,
    why: reasons.join(" | "),
    reasons: Object.freeze([...reasons]),
    selected,
  });
}

function buildFinding(): V3ReasoningTraceFinding {
  return Object.freeze({
    findingIndex: 0,
    findingKey: "job-1:chunk-1:finding-1",
    findingId: "finding-1",
    articleId: 9,
    atomId: "9.5",
    category: "profanity",
    scene: Object.freeze({
      confidence: 0.95,
      semantic: Object.freeze({ confidence: 0.95 }),
      intelligence: Object.freeze({
        conceptContext: Object.freeze({ confidence: 0.95 }),
      }),
    }),
    extractedEvidence: Object.freeze([
      Object.freeze({
        text: "كس امة",
        quote: "كس امة",
        startOffset: 309,
        endOffset: 324,
        confidence: 0.98,
        source: "chunk",
        concepts: Object.freeze(["profanity"]),
        entities: Object.freeze(["speaker"]),
        reason: "Literal profanity in dialogue.",
      }),
    ]),
    detectedKeywords: Object.freeze(["profanity", "insult"]),
    detectedSemanticTags: Object.freeze(["profanity"]),
    detectedEntities: Object.freeze([
      Object.freeze({
        id: "entity-1",
        label: "speaker",
        role: "speaker",
        source: "semantic",
        confidence: 0.9,
        evidence: "كس امة",
      }),
    ]),
    reviewerCandidates: Object.freeze([
      makeCandidate("children", "Children", 0.97, false, ["child", "father", "beating"]),
      makeCandidate("violence", "Violence", 0.94, false, ["weapon", "harm"]),
      makeCandidate("profanity", "Profanity", 0.99, true, ["literal profanity"]),
    ]),
    reviewerSelectionReason: "literal profanity",
    articleCandidates: Object.freeze([
      makeCandidate("6", "Article 6", 0.96, false, ["weapon"]),
      makeCandidate("9", "Article 9", 0.91, true, ["violence"]),
    ]),
    articleSelectionReason: "weapon violence",
    atomCandidates: Object.freeze([
      makeCandidate("9.3", "9.3", 0.92, false, ["threat"]),
      makeCandidate("9.5", "9.5", 0.81, true, ["insult"]),
    ]),
    atomSelectionReason: "insult",
    promptSummary: Object.freeze({
      promptHash: "prompt-hash",
      userPromptHash: "user-prompt-hash",
      promptLengthChars: 4096,
      userPromptLengthChars: 2048,
      estimatedPromptTokens: 1536,
      promptPreview: "prompt preview",
      promptSummary: "prompt summary",
    }),
    providerResponse: Object.freeze({
      providerName: "openai",
      modelName: "gpt-5",
      modelVersion: "2026-07-17",
      responseId: "resp-1",
      responseTimestamp: "2026-07-17T00:00:00.000Z",
      finishReason: "stop",
      usage: Object.freeze({
        promptTokens: 1536,
        completionTokens: 120,
        totalTokens: 1656,
      }),
      rawResponseHash: "raw-response-hash",
      rawResponseChars: 999,
      parsedStatus: "accept",
      parsedConfidence: 0.81,
      parsedReasoning: "Supported by quoted evidence.",
      parsedArticles: Object.freeze([9]),
    }),
    validatorDecisions: Object.freeze({
      grounding: Object.freeze({
        name: "reasonedDecisionValidation",
        valid: true,
        reason: "Grounded.",
        issues: Object.freeze([]),
        lineOfCode: "provider/reasonedDecisionValidation.ts",
      }),
      scope: Object.freeze({
        valid: true,
        reason: "In scope.",
        selectedReviewers: Object.freeze(["Profanity"]),
        rejectedReviewers: Object.freeze(["Children", "Violence"]),
        acceptedFindingsCount: 1,
        rejectedFindingsByScopeCount: 0,
        lineOfCode: "runtime/reviewerScopeValidator.ts",
      }),
      mapping: Object.freeze({
        decisionStatus: "accept",
        decisionArticle: 9,
        decisionAtom: "9.5",
        decisionReason: "Mapped deterministically.",
        validatorHistory: Object.freeze(["grounding:ok", "scope:ok"]),
        acceptedCount: 1,
        rejectedCount: 0,
        droppedCount: 0,
        lineOfCode: "runtime/findingMapper.ts",
      }),
      rejectionReasons: Object.freeze([]),
    }),
    finalFinding: Object.freeze({
      article_id: 9,
      atom_id: "9.5",
      category: "profanity",
      confidence: 0.81,
      rationale_ar: "deterministic rationale",
      description_ar: "deterministic description",
    }),
    stages: Object.freeze([
      Object.freeze({
        stage: "reviewer_candidates",
        order: 1,
        title: "Reviewer Candidates",
        why: "rank reviewers",
        inputCount: 3,
        outputCount: 1,
        payload: Object.freeze({}),
      }),
      Object.freeze({
        stage: "article_candidates",
        order: 2,
        title: "Article Candidates",
        why: "rank articles",
        inputCount: 2,
        outputCount: 1,
        payload: Object.freeze({}),
      }),
    ]),
    decisionTimeline: Object.freeze([
      Object.freeze({ stage: "reviewer_candidates", order: 1, durationMs: 5, note: "rank reviewers" }),
      Object.freeze({ stage: "article_candidates", order: 2, durationMs: 7, note: "rank articles" }),
    ]),
    promptLengthChars: 6144,
    promptTokens: 1536,
    payloadSizeChars: 4096,
    traceHash: "trace-hash",
  } as V3ReasoningTraceFinding);
}

function testFirstDivergence(): void {
  const analysis = analyzeV3ReasoningTrace({
    jobId: "job-1",
    trace: [buildFinding()],
    expected: Object.freeze({
      reviewerLabel: "Profanity",
      articleId: 8,
      atomId: "9.5",
    }),
  });

  assert.equal(analysis.jobId, "job-1");
  assert.equal(analysis.findings.length, 1);
  assert.equal(analysis.firstDivergence?.stage, "article_ranking");
  assert.equal(analysis.findings[0].firstDivergence?.stage, "article_ranking");
  assert.equal(analysis.findings[0].replay.jobId, "job-1");
  assert.equal(analysis.findings[0].metrics.promptTokens, 1536);
  assert.equal(analysis.findings[0].metrics.reviewerAgreement, 1);
  assert.equal(renderV3ReasoningReplayAnalysis(analysis).includes("FIRST DIVERGENCE"), true);
  assert.equal(renderV3ReasoningReplayAnalysis(analysis).includes("Article Ranking"), true);
  console.log("✓ reasoning replay analyzer identifies the first divergence");
}

function testReplayRendering(): void {
  const analysis = analyzeV3ReasoningTrace({
    jobId: "job-1",
    trace: [buildFinding()],
  });

  assert.equal(analysis.firstDivergence, null);
  assert.equal(analysis.metrics.promptSizeChars, 6144);
  assert.equal(analysis.metrics.promptTokens, 1536);
  assert.equal(analysis.renderedReplay.includes("Reviewer Ranking"), true);
  assert.equal(analysis.renderedReplay.includes("Provider Reasoning"), true);
  console.log("✓ reasoning replay analyzer renders a human-readable replay");
}

async function main(): Promise<void> {
  testFirstDivergence();
  testReplayRendering();
  console.log("\nAll reasoning replay analyzer tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
