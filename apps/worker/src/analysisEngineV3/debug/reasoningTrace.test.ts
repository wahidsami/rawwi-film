/**
 * Tests for the V3 reasoning trace diagnostics.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/debug/reasoningTrace.test.ts
 */
import { strict as assert } from "node:assert";

import { createAnalysisFactory } from "../engine/analysisFactory.js";
import { hashForDiagnostics } from "../engine/analysisDiagnostics.js";
import { createV3RuntimeDiagnostics } from "../runtime/runtimeDiagnostics.js";
import { buildV3ReasoningTrace } from "./reasoningTrace.js";
import { renderV3ReasoningTraceSection } from "./reasoningTraceRenderer.js";

function makeRequest() {
  return {
    chunk: {
      text: "A: damn, that plan failed.",
      startOffset: 120,
      endOffset: 146,
      chunkIndex: 4,
    },
    storyMemory: "The conflict escalates after the failed plan.",
    sceneMemory: "Interior, late night, the team argues in a control room.",
    neighboringSentences: ["Before: the plan looked promising.", "After: everyone fell silent."],
    glossary: {
      title: "Glossary Context",
      entries: [
        { term: "damn", articleId: 4, variants: ["damned"], definition: "Direct profanity term." },
      ],
      notes: ["Glossary is knowledge, not classification."],
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      rules: ["Identify literal profanity in the chunk."],
      exclusions: ["Do not classify neutral quotations."],
      requiredEvidence: ["Literal profanity present in the chunk."],
      decisionTree: ["Is there literal profanity?", "Does context negate the literal reading?"],
      examples: ["A direct profanity in dialogue."],
      nonExamples: ["Educational mention of a profanity term."],
      articleIds: [4, 5, 17],
      notes: ["Reference module for the V3 unified engine tests."],
    },
    outputSchema: {
      title: "Analysis Response",
      fields: [
        { name: "promptHash", description: "Rendered prompt hash", required: true },
        { name: "stageHashes", description: "Per-stage hashes", required: true },
        { name: "stageTimings", description: "Per-stage timings", required: true },
      ],
      notes: ["Render the JSON contract exactly once."],
      example: {
        promptHash: "sha256",
        stageHashes: [],
        stageTimings: [],
      },
    },
    config: {
      diagnostics: { enabled: false },
    },
  } as const;
}

function testReasoningTrace(): void {
  const factory = createAnalysisFactory();
  const request = makeRequest();
  const response = factory.analyze(request);

  const diagnostics = createV3RuntimeDiagnostics({
    analysisResponse: response,
    providerName: "openai",
    modelName: "gpt-4.1",
    modelVersion: "test",
    rawResponseHash: hashForDiagnostics(response),
    responseId: "response_test",
    responseTimestamp: "2026-07-13T00:00:00.000Z",
    promptHash: response.promptHash,
    executionSignatureHash: hashForDiagnostics({ prompt: response.promptHash, legal: response.legalHash }),
    subjectModuleId: request.subjectModule.id,
    chunkText: request.chunk.text,
    findingCount: 1,
  });

  const baseFinding = Object.freeze({
    source: "ai",
    article_id: response.legalDecision.articleIds[0] ?? 4,
    atom_id: "4-1",
    severity: "medium",
    confidence: response.legalDecision.confidence,
    title_ar: response.legalDecision.moduleTitle,
    description_ar: response.legalDecision.reason,
    evidence_snippet: response.legalDecision.evidence.primaryCandidateIndex === null
      ? request.chunk.text
      : response.legalDecision.evidence.candidates[response.legalDecision.evidence.primaryCandidateIndex]?.text ?? request.chunk.text,
    rationale_ar: response.legalDecision.reason,
    final_ruling:
      response.legalDecision.status === "accept"
        ? "context_ok"
        : response.legalDecision.status === "reject"
          ? "needs_review"
          : response.legalDecision.status,
    detection_pass: "debug",
    location: {
      start_offset: request.chunk.startOffset,
      end_offset: request.chunk.endOffset,
      start_line: null,
      end_line: null,
      v3: {},
    },
    start_offset_global: request.chunk.startOffset,
    end_offset_global: request.chunk.endOffset,
    canonical_atom: "concept:profanity",
    lineage_id: null,
    parent_lineage_id: null,
    evidence_hash: diagnostics.rawResponseHash,
    canonical_hash: null,
    is_interpretive: false,
    depiction_type: "mention",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: response.context.confidence,
    lexical_confidence: response.evidence.confidence,
    policy_confidence: response.semantic.confidence,
    canonical_finding_id: "finding_001",
    related_article_ids: response.legalDecision.articleIds,
    category: response.legalDecision.moduleId,
  } as const);

  const duplicateFinding = Object.freeze({
    ...baseFinding,
    canonical_finding_id: "finding_002",
    article_id: 17,
    related_article_ids: [4, 17],
  });

  const trace = buildV3ReasoningTrace({
    analysisResponse: response,
    findings: Object.freeze([baseFinding, duplicateFinding]),
  });

  assert.equal(trace.length, 2);
  assert.equal(trace[0].stages.length, 14);
  assert.equal(trace[0].stages[0].stage, "detected_concepts");
  assert.equal(trace[0].stages[13].stage, "final_reviewer_decision");
  assert.equal(trace[0].hash.length, 64);
  assert.deepStrictEqual(trace[0], buildV3ReasoningTrace({ analysisResponse: response, findings: [baseFinding, duplicateFinding] })[0]);

  const rendered = renderV3ReasoningTraceSection({ traces: trace });
  assert(rendered.includes("## Reasoning Trace"));
  assert(rendered.includes("Finding Candidate 1"));
  assert(rendered.includes("Finding Candidate 2"));
  console.log("✓ reasoning trace is deterministic and renders multiple findings");
}

async function main(): Promise<void> {
  testReasoningTrace();
  console.log("\nAll V3 reasoning trace tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
