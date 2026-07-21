/**
 * Regression tests for the V4 runtime orchestrator.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/runtime/runtimeOrchestrator.test.ts
 */
import { strict as assert } from "node:assert";

import type { AnalysisResult } from "../../analysisEngine/types.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import { compareShadowResults } from "../shadow/shadowComparator.js";
import { runRuntimeOrchestrator } from "./runtimeOrchestrator.js";
import type { BenchmarkReport } from "../benchmark/benchmarkTypes.js";
import type { CognitiveDashboard } from "../dashboard/dashboardTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";

function buildFinding(overrides: Partial<V3RuntimeFinding> = {}): V3RuntimeFinding {
  return {
    article_id: 4,
    atom_id: "4-1",
    canonical_atom: "ART4_ATOM_4-1",
    canonical_atoms: ["ART4_ATOM_4-1"],
    intensity: 2,
    context_impact: 2,
    legal_sensitivity: 2,
    audience_risk: 2,
    title_ar: "الألفاظ النابية",
    description_ar: "تطابق هذا السطر مع profanity.",
    severity: "medium",
    confidence: 0.9,
    is_interpretive: false,
    depiction_type: "mention",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: 0.8,
    lexical_confidence: 0.8,
    policy_confidence: 0.8,
    rationale_ar: "evidence grounded",
    final_ruling: "violation",
    detection_pass: "pass-1",
    source: "v4",
    lineage_id: "finding-1",
    parent_lineage_id: null,
    canonical_hash: "hash-1",
    evidence_hash: "evidence-1",
    evidence_snippet: "يا كلب",
    location: {
      start_offset: 12,
      end_offset: 18,
      start_line: 1,
      end_line: 1,
    },
    start_offset_global: 12,
    end_offset_global: 18,
    primary_article_id: 4,
    related_article_ids: [4],
    canonical_finding_id: "finding-1",
    pillar_id: null,
    secondary_pillar_ids: [],
    policy_links: [{ article_id: 4, atom_concept_id: "atom-1", role: "primary" }],
    ...overrides,
  };
}

function buildResult(findings: readonly V3RuntimeFinding[], engineVersion: "v3" | "v4"): AnalysisResult {
  return {
    analysisResponse: {
      diagnostics: {
        engineVersion,
      },
    } as AnalysisResult["analysisResponse"],
    findings,
    diagnostics: {
      engineVersion,
      providerName: `${engineVersion}-provider`,
      modelName: `${engineVersion}-model`,
      modelVersion: engineVersion,
      rawResponseHash: `${engineVersion}-raw`,
      responseId: `${engineVersion}-response`,
      responseTimestamp: null,
      promptHash: `${engineVersion}-prompt`,
      semanticHash: `${engineVersion}-semantic`,
      legalHash: `${engineVersion}-legal`,
      executionSignatureHash: `${engineVersion}-signature`,
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: `${engineVersion}-subject`,
      chunkHash: `${engineVersion}-chunk`,
      findingCount: findings.length,
    },
    truthLayerMeta: {
      scene_analysis_trace: {
        sceneId: "scene-1",
        sceneSummary: "INT. ROOM - NIGHT",
        evidence: [],
        evidenceCollection: null,
        conceptCollection: null,
        legalDecisionCollection: null,
        explanationCollection: null,
        verifiedFindingCollection: null,
        decisionProvenanceCollection: null,
        concepts: [],
        knowledgeDomains: [],
        candidateArticles: [],
        rankedArticles: [],
        selectedArticle: null,
        semanticSceneModel: null,
        semanticSceneResponse: null,
        explanation: null,
        judgeResult: null,
        timing: {
          totalMs: 0,
          nodeTimings: [],
        },
        nodeExecutionOrder: [],
        steps: [],
      },
      analysis_report: {
        sceneId: "scene-1",
        jobId: "job-1",
        scriptId: "script-1",
        versionId: "version-1",
        chunkId: "chunk-1",
        findingsCount: findings.length,
        severityCounts: { low: 0, medium: findings.length, high: 0, critical: 0 },
        summaryJson: { article_ids: findings.map((finding) => finding.article_id) },
        reportHtml: "<section />",
      },
      report_adapter: {
        scene_id: "scene-1",
        job_id: "job-1",
        script_id: "script-1",
        version_id: "version-1",
        chunk_id: "chunk-1",
        findings_count: findings.length,
        severity_counts: { low: 0, medium: findings.length, high: 0, critical: 0 },
        finding_ids: findings.map((finding) => finding.canonical_finding_id ?? finding.lineage_id),
        article_ids: findings.map((finding) => finding.article_id),
        atom_ids: findings.map((finding) => finding.atom_id ?? finding.canonical_atom),
        verified_finding_report: null,
        decision_provenance_report: null,
      },
    },
  };
}

function buildBenchmarkReport(): BenchmarkReport {
  return {
    benchmarkId: "benchmark-1",
    cases: [],
    engineComparisons: { v3: [], v4: [] },
    engineExecution: {
      v3: { runtimeMs: 1, promptTokenEstimate: 10, completionTokenEstimate: 5, estimatedCostUsd: 0.00016 },
      v4: { runtimeMs: 1, promptTokenEstimate: 10, completionTokenEstimate: 5, estimatedCostUsd: 0.00016 },
    },
    stageScores: {
      scene_understanding: { stage: "scene_understanding", score: 1, passed: 1, total: 1 },
      evidence_extraction: { stage: "evidence_extraction", score: 1, passed: 1, total: 1 },
      concept_classification: { stage: "concept_classification", score: 1, passed: 1, total: 1 },
      legal_mapping: { stage: "legal_mapping", score: 1, passed: 1, total: 1 },
      explanation: { stage: "explanation", score: 1, passed: 1, total: 1 },
      judge: { stage: "judge", score: 1, passed: 1, total: 1 },
    },
    engineMetrics: {
      v3: {
        findingPrecision: 1,
        findingRecall: 1,
        evidenceAccuracy: 1,
        evidenceSpanAccuracy: 1,
        conceptAccuracy: 1,
        gcamArticleAccuracy: 1,
        explanationAccuracy: 1,
        duplicateFindingRate: 0,
        hallucinationRate: 0,
        overallReviewScore: 1,
      },
      v4: {
        findingPrecision: 1,
        findingRecall: 1,
        evidenceAccuracy: 1,
        evidenceSpanAccuracy: 1,
        conceptAccuracy: 1,
        gcamArticleAccuracy: 1,
        explanationAccuracy: 1,
        duplicateFindingRate: 0,
        hallucinationRate: 0,
        overallReviewScore: 1,
      },
    },
    metrics: {
      findingPrecision: 1,
      findingRecall: 1,
      evidenceAccuracy: 1,
      evidenceSpanAccuracy: 1,
      conceptAccuracy: 1,
      gcamArticleAccuracy: 1,
      explanationAccuracy: 1,
      duplicateFindingRate: 0,
      hallucinationRate: 0,
      overallReviewScore: 1,
    },
    perStageFailures: {
      scene_understanding: [],
      evidence_extraction: [],
      concept_classification: [],
      legal_mapping: [],
      explanation: [],
      judge: [],
    },
    falsePositives: [],
    falseNegatives: [],
    incorrectEvidence: [],
    incorrectArticleMappings: [],
    hallucinatedExplanations: [],
    markdown: "# Benchmark",
  };
}

function buildDashboard(): CognitiveDashboard {
  const traceDocument = buildResult([buildFinding()], "v4").truthLayerMeta.scene_analysis_trace as SceneAnalysisTraceDocument;
  return {
    sceneId: "scene-1",
    sceneSummary: "INT. ROOM - NIGHT",
    totalExecutionTimeMs: 42,
    totalEstimatedCostUsd: 0.00123,
    traceDocument,
    reportAdapterResult: null,
    nodes: [],
    html: "<section />",
    json: "{}\n",
  };
}

async function testRuntimeOrchestratorBuildsArtifacts(): Promise<void> {
  const visible = buildResult([buildFinding()], "v3");
  const shadow = buildResult([buildFinding()], "v4");
  const comparison = compareShadowResults({ visibleResult: visible, shadowResult: shadow });
  const benchmarkCalls: unknown[] = [];
  const dashboardCalls: unknown[] = [];

  const result = await runRuntimeOrchestrator({
    jobContext: {
      request: {
        jobId: "job-1",
        chunkId: "chunk-1",
        scriptId: "script-1",
        versionId: "version-1",
        chunkText: "INT. ROOM - NIGHT\nفهد: يا كلب",
        chunkStart: 0,
        chunkEnd: 18,
        chunkIndex: 0,
        startLine: 1,
        endLine: 1,
        storyMemory: null,
        sceneMemory: null,
        neighboringSentences: [],
        analysisPromptContext: null,
        promptLexiconTerms: [],
        analysisSignatureContext: null,
        diagnosticsEnabled: false,
      },
    },
    visibleResult: visible,
    shadowResult: shadow,
    comparison,
    traceDocument: null,
    executionTimeMs: 5,
    promptTokenEstimate: 12,
    completionTokenEstimate: 8,
    estimatedCostUsd: 0.00026,
  }, {
    benchmarkRunner: async (cases, options) => {
      benchmarkCalls.push(cases, options);
      assert.equal(cases.length, 1);
      assert.equal(cases[0].expectedFindings.length, 1);
      return buildBenchmarkReport();
    },
    dashboardBuilder: (input) => {
      dashboardCalls.push(input);
      return buildDashboard();
    },
  });

  assert.equal(result.engine, "v4");
  assert.equal(result.trace.sceneId, "scene-1");
  assert.equal(result.report.analysisReport.findingsCount, 1);
  assert.equal(result.provenance, null);
  assert.equal(result.runtime.executionTimeMs, 5);
  assert.equal(result.runtime.promptTokenEstimate, 12);
  assert.equal(result.runtime.completionTokenEstimate, 8);
  assert.equal(result.bundle.engine, "v4");
  assert.equal(result.bundle.mode, "shadow");
  assert.equal(result.bundle.references.v3Report.source, "analysis_reports");
  assert.equal(result.bundle.references.benchmark.identifiers.benchmark_id, "benchmark-1");
  assert.equal(benchmarkCalls.length, 2);
  assert.equal(dashboardCalls.length, 1);
}

async function main(): Promise<void> {
  await testRuntimeOrchestratorBuildsArtifacts();
  console.log("✓ runtime orchestrator builds the shadow artifact bundle deterministically");
  console.log("\nAll V4 runtime orchestrator tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
