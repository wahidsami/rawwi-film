import { createHash } from "node:crypto";

import type { AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import type { BenchmarkReport } from "../benchmark/benchmarkTypes.js";
import type { CognitiveDashboard } from "../dashboard/dashboardTypes.js";
import type { DecisionProvenanceCollection } from "../provenance/decisionProvenanceTypes.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import type { V4ReportAdapterResult } from "../report/reportAdapter.js";
import type { RuntimeMetrics, RuntimeBundle } from "./runtimeArtifacts.js";

export type RuntimeBundleInput = Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument;
  report: V4ReportAdapterResult;
  provenance: DecisionProvenanceCollection | null;
  dashboard: CognitiveDashboard;
  benchmark: BenchmarkReport;
  runtime: RuntimeMetrics;
}>;

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function createHashId(payload: unknown): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(payload));
  return hash.digest("hex");
}

export function buildRuntimeBundle(input: RuntimeBundleInput): RuntimeBundle {
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
