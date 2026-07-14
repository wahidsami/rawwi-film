/**
 * Tests for the V3 brain debug report facility.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/debug/debugReport.test.ts
 */
import { strict as assert } from "node:assert";

import { createAnalysisFactory } from "../engine/analysisFactory.js";
import { hashForDiagnostics } from "../engine/analysisDiagnostics.js";
import { mapLegalDecisionToFindings } from "../runtime/findingMapper.js";
import { createV3RuntimeDiagnostics } from "../runtime/runtimeDiagnostics.js";
import { collectV3DebugReport } from "./debugCollector.js";
import { renderV3DebugReport } from "./debugRenderer.js";

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

function testDebugReport(): void {
  const factory = createAnalysisFactory();
  const request = makeRequest();
  const response = factory.analyze(request);

  const runtimeDiagnostics = createV3RuntimeDiagnostics({
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

  const findings = mapLegalDecisionToFindings({
    decision: response.legalDecision,
    chunkStart: request.chunk.startOffset,
    chunkEnd: request.chunk.endOffset,
    startLine: null,
    endLine: null,
    diagnostics: runtimeDiagnostics,
  });

  const report = collectV3DebugReport({
    analysisResponse: response,
    findings,
    reviewerQuestionsAsked: ["Who is speaking?", "Is the sentence literal?"],
    evidenceCollected: response.legalDecision.evidence.candidates.map((candidate) => candidate.text),
    confidenceEvolution: [
      { stage: "semantic", confidence: response.semantic.confidence, note: "Semantic confidence" },
      { stage: "legal", confidence: response.legalDecision.confidence, note: "Final legal confidence" },
    ],
    discardedHypotheses: ["Benign context"],
    acceptedHypotheses: [response.legalDecision.reason],
    observations: ["Developer debug snapshot"],
    engineVersion: "v3",
    provider: "openai",
    model: "gpt-4.1",
    executionTimeMs: 42,
    totalPromptSize: 1234,
    totalCompletionSize: 456,
    rawResponseHash: runtimeDiagnostics.rawResponseHash,
    executionSignatureHash: runtimeDiagnostics.executionSignatureHash,
    candidateGcamArticles: response.legalDecision.articleIds,
    finalArticle: response.legalDecision.articleIds[0] ?? null,
    truthLayerMeta: {
      gcam_mapping: {
        status: "MAPPED",
        articleId: findings[0]?.article_id ?? response.legalDecision.articleIds[0] ?? null,
        atomId: findings[0]?.atom_id ?? null,
        confidence: findings[0]?.confidence ?? response.legalDecision.confidence,
        matchedRuleId: "gcam_rule_profanity_direct",
        mappingDebt: [],
      },
    },
    knowledgeUsage: {
      lessonsUsed: ["lesson_001_what_is_a_finding", "lesson_002_what_is_evidence"],
      patternsUsed: ["profanity_direct"],
      decisionRecordsUsed: ["decision_001_bribery_phrase"],
      benchmarksReferenced: ["benchmark_profanity_direct"],
      knowledgeAcquisitionRecords: ["kac_001"],
    },
    performance: {
      knowledgeLoadingTimeMs: 3.2,
      reasoningTimeMs: 12.8,
      mappingTimeMs: 1.1,
      findingGenerationTimeMs: 0.7,
    },
  });

  const renderedFirst = renderV3DebugReport(report);
  const renderedSecond = renderV3DebugReport(report);

  assert.equal(renderedFirst, renderedSecond);
  assert.equal(report.hash.length, 64);
  assert.equal(report.output.findings.length, findings.length);
  assert.equal(report.reasoningTrace.traces.length, findings.length);
  assert.equal(report.timeline.length, 6);
  assert.equal(report.academy.loadedLessons.length > 0, true);
  assert.equal(report.academy.loadedReviewerPacks.length > 0, true);
  assert.equal(report.academy.loadedPatternLibraries.length > 0, true);
  assert.equal(report.academy.loadedDecisionRecords.length > 0, true);
  assert.equal(report.academy.loadedBlueprints.length > 0, true);
  assert.equal(report.gcamMapping.mappingStatus, "MAPPED");
  assert.equal(report.reviewerJudgment.primaryDecision, response.legalDecision.status);
  assert.equal(report.reasoningChain.judgment.length > 0, true);
  assert.equal(report.knowledgeUsage.lessonsUsed.length > 0, true);
  assert.equal(report.findingGeneration.findingTitle.length > 0, true);
  assert.equal(report.performance.stageTimings.length > 0, true);
  assert.equal(report.output.diagnosticsHashes.promptHash, response.promptHash);
  assert.equal(report.output.diagnosticsHashes.semanticHash, response.semanticHash);
  assert.equal(report.output.diagnosticsHashes.legalHash, response.legalHash);
  assert.equal(renderedFirst.includes("## GCAM Mapping"), true);
  assert.equal(renderedFirst.includes("## Reviewer Judgment"), true);
  assert.equal(renderedFirst.includes("## Reasoning Chain"), true);
  assert.equal(renderedFirst.includes("## Knowledge Usage"), true);
  assert.equal(renderedFirst.includes("## Finding Generation"), true);
  assert.equal(renderedFirst.includes("## Performance"), true);
  console.log("✓ V3 brain debug report is deterministic and complete");
}

async function main(): Promise<void> {
  testDebugReport();
  console.log("\nAll V3 brain debug report tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
