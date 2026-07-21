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

function serializeShadowError(error: unknown): Readonly<{
  name: string;
  message: string;
  stack: string | null;
  code: string | number | null;
  cause: unknown;
  serializedError: Record<string, unknown>;
}> {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const serializedError: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "name" || key === "message" || key === "stack" || key === "code" || key === "cause") continue;
    serializedError[key] = value;
  }

  return Object.freeze({
    name: typeof record.name === "string" && record.name.length > 0
      ? record.name
      : error instanceof Error
        ? error.name
        : "Error",
    message: typeof record.message === "string"
      ? record.message
      : error instanceof Error
        ? error.message
        : String(record.message ?? error ?? ""),
    stack: typeof record.stack === "string" && record.stack.length > 0
      ? record.stack
      : error instanceof Error
        ? error.stack ?? null
        : null,
    code: typeof record.code === "string" || typeof record.code === "number"
      ? record.code
      : null,
    cause: "cause" in record ? record.cause : null,
    serializedError,
  });
}

async function runShadowStage<T>(
  stageName: string,
  jobId: string,
  chunkId: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  logger.info(`[V4] Stage=${stageName} Started`, { jobId, chunkId });
  try {
    const result = await work();
    logger.info(`[V4] Stage=${stageName} Completed`, {
      jobId,
      chunkId,
      elapsedMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logger.warn(`[V4] Stage=${stageName} FAILED`, {
      jobId,
      chunkId,
      elapsedMs: Date.now() - startedAt,
      ...serializeShadowError(error),
    });
    throw error;
  }
}

export async function runV4ShadowMode(input: Readonly<{
  jobContext: AnalysisJobContext;
  visibleResult: AnalysisResult;
  runKey: string;
}>, dependencies: ShadowExecutionDependencies = {}): Promise<ShadowExecutionResult | null> {
  const startedAt = Date.now();
  logger.info("[V4] shadowExecutor entered", {
    jobId: input.jobContext.request.jobId,
    chunkId: input.jobContext.request.chunkId,
    runKey: input.runKey,
  });
  const shadowEngine = dependencies.shadowEngine ?? createAnalysisEngineV4Adapter();
  const comparator = dependencies.comparator ?? compareShadowResults;
  const orchestrator = dependencies.orchestrator ?? runRuntimeOrchestrator;
  const persist = dependencies.persist ?? persistRuntimeArtifacts;

  try {
    const shadowResult = await runShadowStage(
      "shadowEngine.execute",
      input.jobContext.request.jobId,
      input.jobContext.request.chunkId,
      () => shadowEngine.execute(input.jobContext),
    );
    const traceDocument = buildTraceDocument(shadowResult);
    const comparison = await runShadowStage(
      "comparator",
      input.jobContext.request.jobId,
      input.jobContext.request.chunkId,
      () => comparator({
        visibleResult: input.visibleResult,
        shadowResult,
      }),
    );
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

    const runtime = await runShadowStage(
      "runtimeOrchestrator",
      input.jobContext.request.jobId,
      input.jobContext.request.chunkId,
      () => orchestrator({
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
      }),
    );
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
    const persistence = await runShadowStage(
      "persistRuntimeArtifacts",
      input.jobContext.request.jobId,
      input.jobContext.request.chunkId,
      () => persist({
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
      }),
    );
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
    logger.warn("[V4] Shadow execution aborted", {
      jobId: input.jobContext.request.jobId,
      chunkId: input.jobContext.request.chunkId,
      runKey: input.runKey,
    });
    throw error;
  }
}
