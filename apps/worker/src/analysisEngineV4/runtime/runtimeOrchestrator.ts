import type { AnalysisEngine, AnalysisResult } from "../../analysisEngine/types.js";
import { buildCognitiveDashboard } from "../dashboard/cognitiveDashboard.js";
import { runSceneAnalysisBenchmark } from "../benchmark/benchmarkRunner.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { logger } from "../../logger.js";
import { createTruthVerificationSummary, type FindingTruthNodeVerification } from "../truthVerification.js";
import {
  buildRuntimeBenchmarkCase,
  buildRuntimeMetrics,
  normalizeSceneAnalysisTraceDocument,
  rebuildV4ReportAdapterResult,
  type RuntimeOrchestrationResult,
  type RuntimeOrchestratorInput,
} from "./runtimeArtifacts.js";
import { buildRuntimeBundle } from "./runtimeBundle.js";

export type RuntimeOrchestratorDependencies = Readonly<{
  benchmarkRunner?: typeof runSceneAnalysisBenchmark;
  dashboardBuilder?: typeof buildCognitiveDashboard;
  benchmarkEngines?: Readonly<{ v3: AnalysisEngine; v4: AnalysisEngine }>;
}>;

function createMockEngine(result: AnalysisResult): AnalysisEngine {
  return Object.freeze({
    async execute(): Promise<AnalysisResult> {
      return result;
    },
  });
}

function getTraceDocument(input: RuntimeOrchestratorInput): SceneAnalysisTraceDocument {
  const truthLayerTrace = (input.shadowResult.truthLayerMeta as Record<string, unknown> | null | undefined)?.scene_analysis_trace;
  return normalizeSceneAnalysisTraceDocument(
    input.traceDocument ?? (truthLayerTrace && typeof truthLayerTrace === "object" ? truthLayerTrace as SceneAnalysisTraceDocument : null),
    input.jobContext,
  );
}

export async function runRuntimeOrchestrator(
  input: RuntimeOrchestratorInput,
  dependencies: RuntimeOrchestratorDependencies = {},
): Promise<RuntimeOrchestrationResult> {
  logger.info("[V4] Runtime orchestrator started", {
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
  });
  const benchmarkRunner = dependencies.benchmarkRunner ?? runSceneAnalysisBenchmark;
  const dashboardBuilder = dependencies.dashboardBuilder ?? buildCognitiveDashboard;

  const traceStartedAt = Date.now();
  const traceDocument = getTraceDocument(input);
  const traceExecutionTimeMs = Date.now() - traceStartedAt;

  const reportStartedAt = Date.now();
  const report = rebuildV4ReportAdapterResult({
    jobContext: input.jobContext,
    shadowResult: input.shadowResult,
    traceDocument,
  });
  const reportExecutionTimeMs = Date.now() - reportStartedAt;
  const reportAdapterVerification = ((report.truthLayerMeta as Record<string, unknown> | null | undefined)?.report_adapter as Record<string, unknown> | null | undefined)?.truth_verification as FindingTruthNodeVerification | null ?? null;

  const provenanceStartedAt = Date.now();
  const provenance = traceDocument.decisionProvenanceCollection ?? null;
  const provenanceExecutionTimeMs = Date.now() - provenanceStartedAt;

  const dashboardStartedAt = Date.now();
  const dashboard = dashboardBuilder({
    traceDocument,
    reportAdapterResult: report,
    estimatedCostUsd: input.estimatedCostUsd,
  });
  const dashboardExecutionTimeMs = Date.now() - dashboardStartedAt;

  const benchmarkStartedAt = Date.now();
  const benchmarkCase = buildRuntimeBenchmarkCase({
    jobContext: input.jobContext,
    visibleResult: input.visibleResult,
    traceDocument,
  });
  const benchmark = await benchmarkRunner([benchmarkCase], {
    engines: dependencies.benchmarkEngines ?? {
      v3: createMockEngine(input.visibleResult),
      v4: createMockEngine(input.shadowResult),
    },
  });
  const benchmarkExecutionTimeMs = Date.now() - benchmarkStartedAt;

  const runtime = buildRuntimeMetrics({
    jobContext: input.jobContext,
    visibleResult: input.visibleResult,
    shadowResult: input.shadowResult,
    comparison: input.comparison,
    runtimeExecutionTimeMs: input.executionTimeMs,
    reportExecutionTimeMs,
    provenanceExecutionTimeMs,
    traceExecutionTimeMs,
    dashboardExecutionTimeMs,
    benchmarkExecutionTimeMs,
    promptTokenEstimate: input.promptTokenEstimate,
    completionTokenEstimate: input.completionTokenEstimate,
    estimatedCostUsd: input.estimatedCostUsd,
  });

  const bundle = buildRuntimeBundle({
    jobContext: input.jobContext,
    visibleResult: input.visibleResult,
    shadowResult: input.shadowResult,
    traceDocument,
    report,
    provenance,
    dashboard,
    benchmark,
    runtime,
  });

  const result: RuntimeOrchestrationResult = {
    engine: "v4" as const,
    runtime,
    benchmark,
    dashboard,
    trace: traceDocument,
    report,
    provenance,
    reportAdapterVerification,
    verificationSummary: createTruthVerificationSummary([
      ...traceDocument.verificationTrail,
      ...(reportAdapterVerification ? [reportAdapterVerification] : []),
    ]),
    metrics: Object.freeze({
      benchmark: benchmark.metrics,
      engineMetrics: benchmark.engineMetrics,
      engineExecution: benchmark.engineExecution,
      shadowBenchmark: input.comparison.benchmark,
      comparison: input.comparison,
    }),
    bundle,
  };

  logger.info("[V4] Runtime orchestrator completed", {
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
  });
  return Object.freeze(result);
}
