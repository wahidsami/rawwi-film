import { createAnalysisEngineV4Adapter } from "../../analysisEngine/analysisEngineV4Adapter.js";
import type { AnalysisEngine, AnalysisJobContext, AnalysisResult } from "../../analysisEngine/types.js";
import { logger } from "../../logger.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import { compareShadowResults, type ShadowComparisonReport } from "./shadowComparator.js";
import { runRuntimeOrchestrator, type RuntimeOrchestratorDependencies } from "../runtime/runtimeOrchestrator.js";
import { persistRuntimeArtifacts, type RuntimePersistenceResult } from "../runtime/runtimePersistence.js";
import type { RuntimeOrchestrationResult } from "../runtime/runtimeArtifacts.js";

export type ShadowExecutionResult = Readonly<{
  comparison: ShadowComparisonReport;
  persistence: RuntimePersistenceResult;
  shadowResult: AnalysisResult;
  traceDocument: SceneAnalysisTraceDocument | null;
  runtime: RuntimeOrchestrationResult | null;
  executionTimeMs: number;
  promptTokenEstimate: number;
  completionTokenEstimate: number;
  estimatedCostUsd: number;
}>;

export type ShadowExecutionDependencies = Readonly<{
  shadowEngine?: AnalysisEngine;
  comparator?: typeof compareShadowResults;
  orchestrator?: typeof runRuntimeOrchestrator;
  persist?: typeof persistRuntimeArtifacts;
  benchmarkEngines?: RuntimeOrchestratorDependencies["benchmarkEngines"];
  dashboardBuilder?: RuntimeOrchestratorDependencies["dashboardBuilder"];
  benchmarkRunner?: RuntimeOrchestratorDependencies["benchmarkRunner"];
}>;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildTraceDocument(shadowResult: AnalysisResult): SceneAnalysisTraceDocument | null {
  const trace = shadowResult.truthLayerMeta.scene_analysis_trace;
  if (trace && typeof trace === "object") {
    return trace as SceneAnalysisTraceDocument;
  }
  return null;
}

export async function runV4ShadowMode(input: Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  runKey: string;
}>, dependencies: ShadowExecutionDependencies = {}): Promise<ShadowExecutionResult | null> {
  const startedAt = Date.now();
  logger.info("[V4] Shadow execution started", {
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
    runKey: input.runKey,
  });
  const shadowEngine = dependencies.shadowEngine ?? createAnalysisEngineV4Adapter();
  const comparator = dependencies.comparator ?? compareShadowResults;
  const orchestrator = dependencies.orchestrator ?? runRuntimeOrchestrator;
  const persist = dependencies.persist ?? persistRuntimeArtifacts;

  try {
    const shadowResult = await shadowEngine.execute(input.jobContext);
    const traceDocument = buildTraceDocument(shadowResult);
    const comparison = comparator({
      visibleResult: input.visibleResult,
      shadowResult,
    });
    const executionTimeMs = Date.now() - startedAt;
    const promptTokenEstimate = estimateTokens([
      input.jobContext.request.chunkText,
      JSON.stringify(traceDocument ?? shadowResult.truthLayerMeta),
    ].join("\n"));
    const completionTokenEstimate = estimateTokens([
      JSON.stringify(shadowResult.findings),
      JSON.stringify(shadowResult.analysisResponse),
    ].join("\n"));
    const estimatedCostUsd = Number(((promptTokenEstimate * 0.00001) + (completionTokenEstimate * 0.00003)).toFixed(6));

    const runtime = await orchestrator({
      jobContext: input.jobContext,
      visibleResult: input.visibleResult,
      shadowResult,
      comparison,
      traceDocument,
      executionTimeMs,
      promptTokenEstimate,
      completionTokenEstimate,
      estimatedCostUsd,
    }, {
      benchmarkEngines: dependencies.benchmarkEngines,
      dashboardBuilder: dependencies.dashboardBuilder,
      benchmarkRunner: dependencies.benchmarkRunner,
    });
    logger.info("[V4] Runtime orchestrator completed", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
    });

    logger.info("[V4] Shadow persistence started", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
    });
    const persistence = await persist({
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
      visibleResult: input.visibleResult,
      shadowResult,
      comparison,
      traceDocument: runtime.trace,
      executionTimeMs,
      promptTokenEstimate,
      completionTokenEstimate,
      estimatedCostUsd,
      runtime,
    });
    logger.info("[V4] Shadow persistence completed", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
    });

    logger.info("[V4] Shadow execution completed", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
    });
    return Object.freeze({
      comparison,
      persistence,
      shadowResult,
      traceDocument: runtime.trace,
      runtime,
      executionTimeMs,
      promptTokenEstimate,
      completionTokenEstimate,
      estimatedCostUsd,
    });
  } catch (error) {
    logger.warn("V4 shadow mode execution failed", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
    return null;
  }
}
