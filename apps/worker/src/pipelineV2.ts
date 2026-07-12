import type { AnalysisChunk, AnalysisJob } from "./jobs.js";
import { logger } from "./logger.js";
import { processChunkJudge as processChunkJudgeV1 } from "./pipeline.js";
import { buildChunkContextEnvelope, buildChunkPromptContext } from "./pipelineV2/contextMemory.js";
import { persistMemory2Artifacts } from "./pipelineV2/memory2Persistence.js";
import { buildChunkSceneMemory, buildSceneMemoryPromptContext } from "./pipelineV2/sceneMemory.js";
import { buildScriptMemoryPromptContext, getCachedPipelineV2ScriptMemory } from "./pipelineV2/scriptMemory.js";
import { buildMemory2StageBundle, buildMemory2StagePromptContext } from "./pipelineV2/stagedMemory2.js";
import { sha256 } from "./hash.js";
import { canonicalStringify } from "./canonicalJson.js";

/**
 * Pipeline V2 scaffold:
 * - keeps production-safe behavior by delegating core persistence to V1
 * - adds an explicit extension point for context memory / evidence pinning / auditor improvements
 * - can be rolled out per job via config_snapshot.pipeline_version
 */
export async function processChunkJudgeV2(
  job: AnalysisJob,
  chunk: AnalysisChunk,
  normalizedText: string | null,
  signal?: AbortSignal,
): Promise<void> {
  const contextEnvelope = buildChunkContextEnvelope({ job, chunk, normalizedText });
  const sceneMemory = buildChunkSceneMemory({ job, chunk, normalizedText });
  const scriptMemory = await getCachedPipelineV2ScriptMemory(job, normalizedText);
  const stageBundle = buildMemory2StageBundle({ contextEnvelope, sceneMemory, scriptMemory });
  const promptContext = [
    buildMemory2StagePromptContext(stageBundle),
    buildScriptMemoryPromptContext(scriptMemory),
    buildSceneMemoryPromptContext(sceneMemory),
    buildChunkPromptContext(contextEnvelope),
  ].join("\n\n");

  await persistMemory2Artifacts({
    job,
    chunk,
    contextEnvelope,
    sceneMemory,
    scriptMemory,
    stageBundle,
    promptContext,
  });

  logger.info("Pipeline V2 scaffold active", {
    jobId: job.id,
    chunkId: chunk.id,
    chunkIndex: contextEnvelope.chunkIndex,
    previousChunkIndex: contextEnvelope.memory.previousChunkIndex,
    nextChunkIndex: contextEnvelope.memory.nextChunkIndex,
    carriedForwardManualCount: contextEnvelope.memory.carriedForwardManualCount,
    hasPreviousExcerpt: Boolean(contextEnvelope.memory.previousExcerpt),
    hasNextExcerpt: Boolean(contextEnvelope.memory.nextExcerpt),
    speakerHints: contextEnvelope.memory.speakerHints,
    detectedSceneCount: sceneMemory.detectedSceneCount,
    currentSceneHeading: sceneMemory.currentScene?.heading ?? null,
    previousSceneHeading: sceneMemory.previousScene?.heading ?? null,
    nextSceneHeading: sceneMemory.nextScene?.heading ?? null,
    hasSceneContextBefore: Boolean(sceneMemory.localSceneContext.beforeChunk),
    hasSceneContextAfter: Boolean(sceneMemory.localSceneContext.afterChunk),
    sceneMemorySkippedReason: sceneMemory.skippedReason ?? null,
    hasScriptSummary: Boolean(scriptMemory.summary),
    scriptSummaryHash: scriptMemory.summaryHash ?? null,
    scriptSummarySource: scriptMemory.summarySource ?? null,
    scriptSummaryGenerationDurationMs: scriptMemory.summaryGenerationDurationMs ?? null,
    scriptSummaryGenerationTimestamp: scriptMemory.summaryGenerationTimestamp ?? null,
    scriptSummaryModel: scriptMemory.summaryModel ?? null,
    scriptSummaryVersion: scriptMemory.summaryVersion ?? null,
    stageBundleUsedChars: stageBundle.usedChars,
    scriptMemorySkippedReason: scriptMemory.skippedReason ?? null,
    scriptSpeakerHints: scriptMemory.speakerHints,
  });

  const originalConfig = job.config_snapshot ?? {};
  const originalSignature = (originalConfig as { analysis_signature?: Record<string, unknown> | null }).analysis_signature ?? {};
  const v2Job: AnalysisJob = {
    ...job,
    config_snapshot: {
      ...originalConfig,
      analysis_signature: {
        ...originalSignature,
        memory_version: "memory2-v1",
        scene_memory_version: "v1",
        script_memory_version: "v2",
        summary_hash: scriptMemory.summaryHash ?? null,
        memory_hash: sha256(canonicalStringify(stageBundle)),
        summary_source: scriptMemory.summarySource ?? "unavailable",
        summary_generation_duration_ms: scriptMemory.summaryGenerationDurationMs ?? null,
        summary_generation_timestamp: scriptMemory.summaryGenerationTimestamp ?? null,
        summary_model: scriptMemory.summaryModel ?? null,
        summary_version: scriptMemory.summaryVersion ?? null,
      },
      pipeline_version: "v2",
      v2_prompt_context: promptContext,
    },
  };

  await processChunkJudgeV1(v2Job, chunk, normalizedText, signal);
}
