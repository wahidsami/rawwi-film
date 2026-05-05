import { config } from "./config.js";
import type { AnalysisChunk, AnalysisJob } from "./jobs.js";
import { logger } from "./logger.js";
import { processChunkJudge as processChunkJudgeV1 } from "./pipeline.js";
import { processChunkJudgeV2 } from "./pipelineV2.js";

export type AnalysisPipelineVersion = "v1" | "v2";

export function resolvePipelineVersion(job: AnalysisJob): AnalysisPipelineVersion {
  const snapshot = job.config_snapshot as { pipeline_version?: string; analysis_memory_mode?: string } | null;
  if (snapshot?.analysis_memory_mode === "memory2") return "v2";
  const requested = snapshot?.pipeline_version;
  return requested === "v2" ? "v2" : config.ANALYSIS_PIPELINE_VERSION;
}

export async function processChunkForJob(
  job: AnalysisJob,
  chunk: AnalysisChunk,
  normalizedText: string | null,
  signal?: AbortSignal,
): Promise<void> {
  const pipelineVersion = resolvePipelineVersion(job);

  logger.info("Dispatching analysis pipeline", {
    jobId: job.id,
    chunkId: chunk.id,
    pipelineVersion,
  });

  if (pipelineVersion === "v2") {
    await processChunkJudgeV2(job, chunk, normalizedText, signal);
    return;
  }

  await processChunkJudgeV1(job, chunk, normalizedText, signal);
}
