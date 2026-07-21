import { createHash } from "node:crypto";

import type { AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import type { BenchmarkReport, BenchmarkScreenplay } from "../benchmark/benchmarkTypes.js";
import type { CognitiveDashboard } from "../dashboard/dashboardTypes.js";
import type { DecisionProvenanceCollection } from "../provenance/decisionProvenanceTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import type { V4ReportAdapterResult, V4AnalysisReportRow } from "../report/reportBuilder.js";
import type { ShadowBenchmarkSummary, ShadowComparisonReport } from "../shadow/shadowComparator.js";
import type { FindingTruthNodeVerification, TruthVerificationSummary } from "../truthVerification.js";

export type RuntimeEvidenceSnapshot = Readonly<{
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  lineId: string | null;
  pageNumber: number | null;
}>;

export type RuntimeMetrics = Readonly<{
  jobId: string;
  chunkId: string;
  runKey: string;
  executionTimeMs: number;
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
  reportExecutionTimeMs: number;
  provenanceExecutionTimeMs: number;
  traceExecutionTimeMs: number;
  dashboardExecutionTimeMs: number;
  benchmarkExecutionTimeMs: number;
  visibleFindingCount: number;
  shadowFindingCount: number;
  matchedFindingCount: number;
  visibleOnlyFindingCount: number;
  shadowOnlyFindingCount: number;
  duplicateFindingCount: number;
  hallucinationCount: number;
}>;

export type RuntimeBundleReference = Readonly<{
  kind: string;
  label: string;
  source: string;
  identifiers: Readonly<Record<string, string | number | null>>;
  summary: Readonly<Record<string, unknown>>;
}>;

export type RuntimeBundle = Readonly<{
  bundleId: string;
  engine: "v4";
  mode: "shadow";
  createdFrom: Readonly<{ jobId: string; chunkId: string; runKey: string }>;
  references: Readonly<{
    v3Report: RuntimeBundleReference;
    v4Report: RuntimeBundleReference;
    benchmark: RuntimeBundleReference;
    trace: RuntimeBundleReference;
    dashboard: RuntimeBundleReference;
    provenance: RuntimeBundleReference;
    runtime: RuntimeBundleReference;
    metrics: RuntimeBundleReference;
    tokenUsage: RuntimeBundleReference;
    costEstimates: RuntimeBundleReference;
    executionTimings: RuntimeBundleReference;
  }>;
}>;

export type RuntimeOrchestratorInput = Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
  comparison: ShadowComparisonReport;
  traceDocument: SceneAnalysisTraceDocument | null;
  executionTimeMs: number;
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
}>;

export type RuntimeOrchestrationResult = Readonly<{
  engine: "v4";
  runtime: RuntimeMetrics;
  benchmark: BenchmarkReport;
  dashboard: CognitiveDashboard;
  trace: SceneAnalysisTraceDocument;
  report: V4ReportAdapterResult;
  provenance: DecisionProvenanceCollection | null;
  reportAdapterVerification: FindingTruthNodeVerification | null;
  verificationSummary: TruthVerificationSummary | null;
  metrics: Readonly<{
    benchmark: BenchmarkReport["metrics"];
    engineMetrics: BenchmarkReport["engineMetrics"];
    engineExecution: BenchmarkReport["engineExecution"];
    shadowBenchmark: ShadowBenchmarkSummary;
    comparison: ShadowComparisonReport;
  }>;
  bundle: RuntimeBundle;
}>;

export type RuntimeCaseFinding = Readonly<{
  findingId: string;
  expectedEvidence: RuntimeEvidenceSnapshot;
  expectedConceptId: string;
  expectedGcamArticleId: number;
  expectedExplanation: string;
  expectedAction: "accept" | "reject" | "needs_review";
}>;

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function createHashId(payload: unknown): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(payload));
  return hash.digest("hex");
}

function createEmptyTraceDocument(jobContext: AnalysisJobContext): SceneAnalysisTraceDocument {
  return freeze({
    sceneId: jobContext.request.chunkId,
    sceneSummary: normalizeText(jobContext.request.chunkText),
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
    findingTruth: null,
    verificationTrail: freeze([]),
    explanation: null,
    judgeResult: null,
    verificationSummary: null,
    timing: freeze({
      totalMs: 0,
      nodeTimings: freeze([]),
    }),
    nodeExecutionOrder: freeze([]),
    steps: freeze([]),
  });
}

function createEvidenceSnapshot(text: string, startOffset: number | null, endOffset: number | null, lineId: string | null): RuntimeEvidenceSnapshot {
  return freeze({
    text,
    startOffset,
    endOffset,
    lineId,
    pageNumber: null,
  });
}

function mapAction(finalRuling: string | null | undefined): "accept" | "reject" | "needs_review" {
  const value = String(finalRuling ?? "reject");
  if (value === "context_ok" || value === "accept") return "accept";
  if (value === "needs_review") return "needs_review";
  return "reject";
}

function buildExpectedFindingsFromAnalysisResult(result: AnalysisResult): readonly RuntimeCaseFinding[] {
  const findings = [...result.findings].sort((left, right) => {
    const leftKey = [left.lineage_id ?? left.canonical_finding_id ?? "", left.article_id, left.atom_id ?? left.canonical_atom ?? "", normalizeText(left.evidence_snippet ?? ""), left.start_offset_global ?? -1, left.end_offset_global ?? -1].join("|");
    const rightKey = [right.lineage_id ?? right.canonical_finding_id ?? "", right.article_id, right.atom_id ?? right.canonical_atom ?? "", normalizeText(right.evidence_snippet ?? ""), right.start_offset_global ?? -1, right.end_offset_global ?? -1].join("|");
    return leftKey.localeCompare(rightKey);
  });

  return freeze(findings.map((finding, index) => freeze({
    findingId: finding.canonical_finding_id ?? finding.lineage_id ?? `finding-${index + 1}`,
    expectedEvidence: createEvidenceSnapshot(
      finding.evidence_snippet ?? "",
      finding.start_offset_global ?? null,
      finding.end_offset_global ?? null,
      finding.lineage_id ?? finding.canonical_finding_id ?? null,
    ),
    expectedConceptId: finding.category ?? "n/a",
    expectedGcamArticleId: finding.article_id,
    expectedExplanation: finding.description_ar ?? "",
    expectedAction: mapAction(finding.final_ruling),
  })));
}

export function normalizeSceneAnalysisTraceDocument(trace: SceneAnalysisTraceDocument | null, jobContext: AnalysisJobContext): SceneAnalysisTraceDocument {
  if (!trace) {
    return createEmptyTraceDocument(jobContext);
  }

  const base = createEmptyTraceDocument(jobContext);
  const timing = trace.timing ?? base.timing;
  return freeze({
    ...base,
    ...trace,
    evidence: trace.evidence ?? base.evidence,
    evidenceCollection: trace.evidenceCollection ?? base.evidenceCollection,
    conceptCollection: trace.conceptCollection ?? base.conceptCollection,
    legalDecisionCollection: trace.legalDecisionCollection ?? base.legalDecisionCollection,
    explanationCollection: trace.explanationCollection ?? base.explanationCollection,
    verifiedFindingCollection: trace.verifiedFindingCollection ?? base.verifiedFindingCollection,
    decisionProvenanceCollection: trace.decisionProvenanceCollection ?? base.decisionProvenanceCollection,
    concepts: trace.concepts ?? base.concepts,
    knowledgeDomains: trace.knowledgeDomains ?? base.knowledgeDomains,
    candidateArticles: trace.candidateArticles ?? base.candidateArticles,
    rankedArticles: trace.rankedArticles ?? base.rankedArticles,
    selectedArticle: trace.selectedArticle ?? base.selectedArticle,
    semanticSceneModel: trace.semanticSceneModel ?? base.semanticSceneModel,
    semanticSceneResponse: trace.semanticSceneResponse ?? base.semanticSceneResponse,
    findingTruth: trace.findingTruth ?? base.findingTruth,
    verificationTrail: freeze(trace.verificationTrail ?? base.verificationTrail),
    explanation: trace.explanation ?? base.explanation,
    judgeResult: trace.judgeResult ?? base.judgeResult,
    verificationSummary: trace.verificationSummary ?? base.verificationSummary,
    timing: freeze({
      totalMs: timing.totalMs ?? base.timing.totalMs,
      nodeTimings: timing.nodeTimings ?? base.timing.nodeTimings,
    }),
    nodeExecutionOrder: trace.nodeExecutionOrder ?? base.nodeExecutionOrder,
    steps: trace.steps ?? base.steps,
  });
}

export function rebuildV4ReportAdapterResult(input: Readonly<{
  jobContext: AnalysisJobContext;
  shadowResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument;
}>): V4ReportAdapterResult {
  const shadowMeta = (input.shadowResult.truthLayerMeta as Record<string, unknown> | null | undefined) ?? null;
  const reportAdapterTruth = (shadowMeta?.report_adapter as Record<string, unknown> | null | undefined) ?? null;
  const analysisReport = shadowMeta?.analysis_report as V4AnalysisReportRow | undefined;
  const decisionProvenanceCollection = input.traceDocument.decisionProvenanceCollection;
  const verifiedFindingReport = input.traceDocument.verifiedFindingCollection?.report ?? null;
  const decisionProvenanceReport = decisionProvenanceCollection?.report ?? (shadowMeta?.decision_provenance as DecisionProvenanceCollection["report"] | null | undefined) ?? null;
  const reportDocument = freeze({
    sceneId: input.traceDocument.sceneId,
    jobId: input.jobContext.request.jobId,
    scriptId: input.jobContext.request.scriptId,
    versionId: input.jobContext.request.versionId,
    chunkId: input.jobContext.request.chunkId,
    analysisFindings: Object.freeze([...input.shadowResult.findings]),
    analysisReport: analysisReport ?? freeze({
      sceneId: input.traceDocument.sceneId,
      jobId: input.jobContext.request.jobId,
      scriptId: input.jobContext.request.scriptId,
      versionId: input.jobContext.request.versionId,
      chunkId: input.jobContext.request.chunkId,
      findingsCount: input.shadowResult.findings.length,
      severityCounts: freeze({ low: 0, medium: 0, high: 0, critical: 0 }),
      summaryJson: freeze({}),
      reportHtml: "",
    }),
    verifiedFindingReport,
    decisionProvenanceReport,
    executionTimeMs: 0,
  });

  return freeze({
    analysisFindings: Object.freeze([...input.shadowResult.findings]),
    analysisReport: analysisReport ?? reportDocument.analysisReport,
    reportDocument,
    truthLayerMeta: freeze({
      report_adapter: reportAdapterTruth ?? freeze({
        scene_id: input.traceDocument.sceneId,
        job_id: input.jobContext.request.jobId,
        script_id: input.jobContext.request.scriptId,
        version_id: input.jobContext.request.versionId,
        chunk_id: input.jobContext.request.chunkId,
        findings_count: input.shadowResult.findings.length,
        severity_counts: reportDocument.analysisReport.severityCounts,
        finding_ids: input.shadowResult.findings.map((finding) => finding.canonical_finding_id ?? finding.lineage_id ?? null),
        article_ids: input.shadowResult.findings.map((finding) => finding.article_id),
        atom_ids: input.shadowResult.findings.map((finding) => finding.atom_id ?? finding.canonical_atom ?? null),
        verified_finding_report: verifiedFindingReport,
        decision_provenance_report: decisionProvenanceReport,
      }),
    }),
  });
}

export function buildRuntimeBenchmarkCase(input: Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument;
}>): BenchmarkScreenplay {
  const expectedFindings = buildExpectedFindingsFromAnalysisResult(input.visibleResult);
  return freeze({
    screenplayId: input.jobContext.request.scriptId,
    sceneId: input.traceDocument.sceneId,
    sceneText: input.jobContext.request.chunkText,
    expectedSceneSummary: input.traceDocument.sceneSummary,
    expectedFindings,
  });
}

export function buildRuntimeMetrics(input: Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
  comparison: ShadowComparisonReport;
  runtimeExecutionTimeMs: number;
  reportExecutionTimeMs: number;
  provenanceExecutionTimeMs: number;
  traceExecutionTimeMs: number;
  dashboardExecutionTimeMs: number;
  benchmarkExecutionTimeMs: number;
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
}>): RuntimeMetrics {
  return freeze({
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
    runKey: `${input.jobContext.request.jobId}:${input.jobContext.request.chunkId}`,
    executionTimeMs: input.runtimeExecutionTimeMs,
    promptTokenEstimate: input.promptTokenEstimate,
    completionTokenEstimate: input.completionTokenEstimate,
    estimatedCostUsd: Number(input.estimatedCostUsd.toFixed(6)),
    reportExecutionTimeMs: input.reportExecutionTimeMs,
    provenanceExecutionTimeMs: input.provenanceExecutionTimeMs,
    traceExecutionTimeMs: input.traceExecutionTimeMs,
    dashboardExecutionTimeMs: input.dashboardExecutionTimeMs,
    benchmarkExecutionTimeMs: input.benchmarkExecutionTimeMs,
    visibleFindingCount: input.visibleResult.findings.length,
    shadowFindingCount: input.shadowResult.findings.length,
    matchedFindingCount: input.comparison.matchedFindingCount,
    visibleOnlyFindingCount: input.comparison.visibleOnlyFindingCount,
    shadowOnlyFindingCount: input.comparison.shadowOnlyFindingCount,
    duplicateFindingCount: input.comparison.duplicateFindingCount,
    hallucinationCount: input.comparison.hallucinationCount,
  });
}

export function buildRuntimeBundle(input: Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
  comparison: ShadowComparisonReport;
  traceDocument: SceneAnalysisTraceDocument;
  report: V4ReportAdapterResult;
  provenance: DecisionProvenanceCollection | null;
  dashboard: CognitiveDashboard;
  benchmark: BenchmarkReport;
  runtime: RuntimeMetrics;
}>): RuntimeBundle {
  const bundleSeed = {
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
    runKey: `${input.jobContext.request.jobId}:${input.jobContext.request.chunkId}`,
    sceneId: input.traceDocument.sceneId,
    visibleFindings: input.visibleResult.findings.map((finding) => ({ article: finding.article_id, atom: finding.atom_id ?? finding.canonical_atom ?? null, evidence: finding.evidence_snippet ?? "" })),
    shadowFindings: input.shadowResult.findings.map((finding) => ({ article: finding.article_id, atom: finding.atom_id ?? finding.canonical_atom ?? null, evidence: finding.evidence_snippet ?? "" })),
    benchmarkId: input.benchmark.benchmarkId,
    dashboardNodes: input.dashboard.nodes.length,
    provenanceCount: input.provenance?.provenance.length ?? 0,
    executionTimeMs: input.runtime.executionTimeMs,
  };

  return freeze({
    bundleId: createHashId(bundleSeed),
    engine: "v4",
    mode: "shadow",
    createdFrom: freeze({
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runtime.runKey,
    }),
    references: freeze({
      v3Report: freeze({
        kind: "database-row",
        label: "V3 Report",
        source: "analysis_reports",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          script_id: input.jobContext.request.scriptId,
          version_id: input.jobContext.request.versionId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          findings_count: input.visibleResult.findings.length,
        }),
      }),
      v4Report: freeze({
        kind: "truth-layer-json",
        label: "V4 Report",
        source: "shadow_truth_layer_meta.analysis_report",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          findings_count: input.report.analysisReport.findingsCount,
          article_ids: input.report.analysisReport.summaryJson.article_ids,
        }),
      }),
      benchmark: freeze({
        kind: "benchmark-report",
        label: "Benchmark",
        source: "runtime.benchmark",
        identifiers: freeze({
          benchmark_id: input.benchmark.benchmarkId,
        }),
        summary: freeze({
          overall_review_score: input.benchmark.metrics.overallReviewScore,
          finding_precision: input.benchmark.metrics.findingPrecision,
          finding_recall: input.benchmark.metrics.findingRecall,
        }),
      }),
      trace: freeze({
        kind: "trace-document",
        label: "Trace",
        source: "shadow_truth_layer_meta.trace_document",
        identifiers: freeze({
          scene_id: input.traceDocument.sceneId,
        }),
        summary: freeze({
          node_execution_order: input.traceDocument.nodeExecutionOrder,
          step_count: input.traceDocument.steps.length,
        }),
      }),
      dashboard: freeze({
        kind: "developer-dashboard",
        label: "Dashboard",
        source: "runtime.dashboard",
        identifiers: freeze({
          scene_id: input.dashboard.sceneId,
        }),
        summary: freeze({
          node_count: input.dashboard.nodes.length,
          total_execution_time_ms: input.dashboard.totalExecutionTimeMs,
        }),
      }),
      provenance: freeze({
        kind: "lineage-graph",
        label: "Decision Provenance",
        source: "shadow_truth_layer_meta.decision_provenance",
        identifiers: freeze({
          scene_id: input.traceDocument.sceneId,
        }),
        summary: freeze({
          total_findings: input.provenance?.report.totalFindings ?? 0,
          graph_nodes: input.provenance?.report.graphNodeCount ?? 0,
          graph_edges: input.provenance?.report.graphEdgeCount ?? 0,
        }),
      }),
      runtime: freeze({
        kind: "runtime-metrics",
        label: "Runtime Metrics",
        source: "shadow_truth_layer_meta.runtime",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          execution_time_ms: input.runtime.executionTimeMs,
          benchmark_execution_time_ms: input.runtime.benchmarkExecutionTimeMs,
          dashboard_execution_time_ms: input.runtime.dashboardExecutionTimeMs,
        }),
      }),
      metrics: freeze({
        kind: "aggregate-metrics",
        label: "Metrics",
        source: "shadow_truth_layer_meta.metrics",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          benchmark_overall_review_score: input.benchmark.metrics.overallReviewScore,
          shadow_overall_score: input.comparison.benchmark.overallShadowScore,
        }),
      }),
      tokenUsage: freeze({
        kind: "token-usage",
        label: "Token Usage",
        source: "shadow_truth_layer_meta.runtime",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          prompt_token_estimate: input.runtime.promptTokenEstimate,
          completion_token_estimate: input.runtime.completionTokenEstimate,
        }),
      }),
      costEstimates: freeze({
        kind: "cost-estimate",
        label: "Cost Estimates",
        source: "shadow_truth_layer_meta.runtime",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          estimated_cost_usd: input.runtime.estimatedCostUsd,
        }),
      }),
      executionTimings: freeze({
        kind: "timing",
        label: "Execution Timings",
        source: "shadow_truth_layer_meta.runtime",
        identifiers: freeze({
          job_id: input.jobContext.request.jobId,
          chunk_id: input.jobContext.request.chunkId,
        }),
        summary: freeze({
          execution_time_ms: input.runtime.executionTimeMs,
          report_execution_time_ms: input.runtime.reportExecutionTimeMs,
          provenance_execution_time_ms: input.runtime.provenanceExecutionTimeMs,
          trace_execution_time_ms: input.runtime.traceExecutionTimeMs,
          dashboard_execution_time_ms: input.runtime.dashboardExecutionTimeMs,
          benchmark_execution_time_ms: input.runtime.benchmarkExecutionTimeMs,
        }),
      }),
    }),
  });
}
