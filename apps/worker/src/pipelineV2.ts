import type { AnalysisChunk, AnalysisJob } from "./jobs.js";
import { logger } from "./logger.js";
import { processChunkJudge as processChunkJudgeV1 } from "./pipeline.js";
import { buildChunkContextEnvelope, buildChunkPromptContext } from "./pipelineV2/contextMemory.js";
import { buildChunkSceneMemory, buildSceneMemoryPromptContext } from "./pipelineV2/sceneMemory.js";
import { buildScriptMemoryPromptContext, getCachedPipelineV2ScriptMemory } from "./pipelineV2/scriptMemory.js";

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
  const promptContext = [
    buildScriptMemoryPromptContext(scriptMemory),
    buildSceneMemoryPromptContext(sceneMemory),
    buildChunkPromptContext(contextEnvelope),
  ].join("\n\n");

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
    scriptMemorySkippedReason: scriptMemory.skippedReason ?? null,
    scriptSpeakerHints: scriptMemory.speakerHints,
  });

  const originalConfig = job.config_snapshot ?? {};
  const v2Job: AnalysisJob = {
    ...job,
    config_snapshot: {
      ...originalConfig,
      pipeline_version: "v2",
      v2_prompt_context: promptContext,
    },
  };

  await processChunkJudgeV1(v2Job, chunk, normalizedText, signal);
}
