import { logger } from "../../logger.js";
import type { AnalysisResult } from "../../analysisEngine/types.js";
import type { SceneAnalysisTraceDocument } from "../sceneAnalysisTraceViewer.js";
import type { ShadowComparisonReport } from "./shadowComparator.js";
import type { RuntimeOrchestrationResult } from "../runtime/runtimeArtifacts.js";

export type ShadowPersistenceInput = Readonly<{
  jobId: string;
  chunkId: string;
  runKey: string;
  visibleResult: AnalysisResult;
  shadowResult: AnalysisResult;
  comparison: ShadowComparisonReport;
  traceDocument: SceneAnalysisTraceDocument | null;
  executionTimeMs: number;
  promptTokenEstimate: number | null;
  completionTokenEstimate: number | null;
  estimatedCostUsd: number | null;
  runtimeArtifacts?: RuntimeOrchestrationResult | null;
}>;

export type ShadowPersistenceResult = Readonly<{
  shadowRunKey: string;
  evaluationPersisted: boolean;
  chunkRunPersisted: boolean;
}>;

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function buildShadowRunKey(runKey: string, chunkId: string): string {
  return `shadow:${runKey}:${chunkId}`;
}

function buildShadowTruthLayerMeta(input: ShadowPersistenceInput): Readonly<Record<string, unknown>> {
  const runtimeArtifacts = input.runtimeArtifacts ?? null;
  return freeze({
    architecture: "analysis_engine_v4_shadow_mode",
    mode: "shadow",
    visible_engine: input.visibleResult.diagnostics.engineVersion,
    shadow_engine: input.shadowResult.diagnostics.engineVersion,
    job_id: input.jobId,
    chunk_id: input.chunkId,
    run_key: input.runKey,
    shadow_run_key: buildShadowRunKey(input.runKey, input.chunkId),
    runtime_ms: input.executionTimeMs,
    prompt_token_estimate: input.promptTokenEstimate,
    completion_token_estimate: input.completionTokenEstimate,
    estimated_cost_usd: input.estimatedCostUsd,
    visible_findings_count: input.visibleResult.findings.length,
    shadow_findings_count: input.shadowResult.findings.length,
    comparison: input.comparison,
    comparison_benchmark: input.comparison.benchmark,
    visible_diagnostics: input.visibleResult.diagnostics,
    shadow_diagnostics: input.shadowResult.diagnostics,
    visible_truth_layer_meta: input.visibleResult.truthLayerMeta,
    shadow_truth_layer_meta: input.shadowResult.truthLayerMeta,
    trace_document: input.traceDocument,
    shadow_findings: input.shadowResult.findings,
    runtime_orchestrator: runtimeArtifacts,
    investigation_bundle: runtimeArtifacts?.bundle ?? null,
    runtime: runtimeArtifacts?.runtime ?? null,
    benchmark: runtimeArtifacts?.benchmark ?? input.comparison.benchmark,
    dashboard: runtimeArtifacts?.dashboard ?? null,
    report: runtimeArtifacts?.report ?? null,
    provenance: runtimeArtifacts?.provenance ?? null,
    metrics: runtimeArtifacts?.metrics ?? null,
  });
}

export function buildShadowChunkRunRecord(input: ShadowPersistenceInput): Readonly<Record<string, unknown>> {
  const shadowTruthLayerMeta = buildShadowTruthLayerMeta(input);
  return freeze({
    run_key: buildShadowRunKey(input.runKey, input.chunkId),
    job_id: input.jobId,
    router_candidates: freeze({
      visible_engine: input.visibleResult.diagnostics.engineVersion,
      shadow_engine: input.shadowResult.diagnostics.engineVersion,
      comparison: input.comparison,
    }),
    raw_ai_findings: input.shadowResult.findings,
    validated_ai_findings: input.shadowResult.findings,
    ai_findings: input.shadowResult.findings,
    truth_layer_meta: shadowTruthLayerMeta,
  });
}

export function buildShadowEngineEvaluationRecord(input: ShadowPersistenceInput): Readonly<Record<string, unknown>> {
  return freeze({
    job_id: input.jobId,
    chunk_id: input.chunkId,
    run_key: buildShadowRunKey(input.runKey, input.chunkId),
    engine: "v4",
    mode: "shadow",
    baseline_count: input.visibleResult.findings.length,
    hybrid_count: input.shadowResult.findings.length,
    baseline_contradictions: input.comparison.visibleOnlyFindingCount,
    baseline_severe_disagreements: input.comparison.shadowOnlyFindingCount,
    hybrid_context_ok: input.comparison.matchedFindingCount,
    hybrid_needs_review: input.comparison.comparisons.filter((comparison) => comparison.visibleFinding !== null && comparison.shadowFinding !== null && (!comparison.matches.article || !comparison.matches.explanation)).length,
    hybrid_violation: input.comparison.shadowOnlyFindingCount,
  });
}

export async function persistShadowMode(input: ShadowPersistenceInput): Promise<ShadowPersistenceResult> {
  const { supabase } = await import("../../db.js");
  const shadowRunKey = buildShadowRunKey(input.runKey, input.chunkId);
  const chunkRunPayload = buildShadowChunkRunRecord(input);
  const evaluationPayload = buildShadowEngineEvaluationRecord(input);
  let evaluationPersisted = false;
  let chunkRunPersisted = false;

  logger.info("[V4] Shadow persistence start", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    runKey: shadowRunKey,
  });
  try {
    const { error } = await supabase
      .from("analysis_chunk_runs")
      .upsert(chunkRunPayload, { onConflict: "run_key" });
    if (error) {
      logger.warn("Failed to persist V4 shadow chunk run", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        runKey: shadowRunKey,
        error: error.message,
        errorCode: error.code,
      });
    } else {
      chunkRunPersisted = true;
    }
  } catch (error) {
    logger.warn("Failed to persist V4 shadow chunk run", {
      jobId: input.jobId,
      chunkId: input.chunkId,
      runKey: shadowRunKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  }

  try {
    const { data: existing, error: lookupError } = await supabase
      .from("analysis_engine_evaluations")
      .select("id")
      .eq("run_key", shadowRunKey)
      .maybeSingle();
    if (lookupError) {
      logger.warn("Failed to lookup V4 shadow benchmark summary", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        runKey: shadowRunKey,
        error: lookupError.message,
        errorCode: lookupError.code,
      });
    } else {
      if (existing?.id) {
        evaluationPersisted = true;
      } else {
        const { error } = await supabase
          .from("analysis_engine_evaluations")
          .insert(evaluationPayload);
        if (error) {
          logger.warn("Failed to persist V4 shadow benchmark summary", {
            jobId: input.jobId,
            chunkId: input.chunkId,
            runKey: shadowRunKey,
            error: error.message,
            errorCode: error.code,
          });
        } else {
          evaluationPersisted = true;
        }
      }
    }
  } catch (error) {
    logger.warn("Failed to persist V4 shadow benchmark summary", {
      jobId: input.jobId,
      chunkId: input.chunkId,
      runKey: shadowRunKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  }

  logger.info("[V4] Shadow persistence end", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    runKey: shadowRunKey,
    chunkRunPersisted,
    evaluationPersisted,
  });
  return Object.freeze({
    shadowRunKey,
    evaluationPersisted,
    chunkRunPersisted,
  });
}
