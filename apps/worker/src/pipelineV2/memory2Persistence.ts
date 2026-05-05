import { supabase } from "../db.js";
import type { AnalysisChunk, AnalysisJob } from "../jobs.js";
import { logger } from "../logger.js";
import type { ChunkContextEnvelope } from "./contextMemory.js";
import type { ChunkSceneMemory } from "./sceneMemory.js";
import type { ScriptMemoryPayload } from "./scriptMemory.js";
import type { Memory2StageBundle } from "./stagedMemory2.js";

export const MEMORY2_VERSION = "memory2-v1";

function isMemory2Job(job: AnalysisJob): boolean {
  const mode = (job.config_snapshot as { analysis_memory_mode?: string } | null)?.analysis_memory_mode;
  return String(mode ?? "").toLowerCase() === "memory2";
}

type PersistArgs = {
  job: AnalysisJob;
  chunk: AnalysisChunk;
  contextEnvelope: ChunkContextEnvelope;
  sceneMemory: ChunkSceneMemory;
  scriptMemory: ScriptMemoryPayload;
  stageBundle: Memory2StageBundle;
  promptContext: string;
};

export async function persistMemory2Artifacts(args: PersistArgs): Promise<void> {
  if (!isMemory2Job(args.job)) return;

  const unitRows = [
    {
      job_id: args.job.id,
      script_id: args.job.script_id,
      version_id: args.job.version_id,
      chunk_id: null,
      chunk_index: null,
      dedupe_key: "script:summary",
      scope_level: "script",
      unit_type: "script_memory_summary",
      memory_version: MEMORY2_VERSION,
      payload: args.scriptMemory,
      source_offsets: null,
    },
    {
      job_id: args.job.id,
      script_id: args.job.script_id,
      version_id: args.job.version_id,
      chunk_id: args.chunk.id,
      chunk_index: args.chunk.chunk_index,
      dedupe_key: `chunk:${args.chunk.id}:context`,
      scope_level: "chunk",
      unit_type: "chunk_context_envelope",
      memory_version: MEMORY2_VERSION,
      payload: args.contextEnvelope,
      source_offsets: {
        start_offset_global: args.chunk.start_offset,
        end_offset_global: args.chunk.end_offset,
      },
    },
    {
      job_id: args.job.id,
      script_id: args.job.script_id,
      version_id: args.job.version_id,
      chunk_id: args.chunk.id,
      chunk_index: args.chunk.chunk_index,
      dedupe_key: `chunk:${args.chunk.id}:scene`,
      scope_level: "scene",
      unit_type: "scene_memory_context",
      memory_version: MEMORY2_VERSION,
      payload: args.sceneMemory,
      source_offsets: args.sceneMemory.currentScene
        ? {
            scene_start_offset_global: args.sceneMemory.currentScene.startOffset,
            scene_end_offset_global: args.sceneMemory.currentScene.endOffset,
            chunk_start_offset_global: args.chunk.start_offset,
            chunk_end_offset_global: args.chunk.end_offset,
          }
        : {
            chunk_start_offset_global: args.chunk.start_offset,
            chunk_end_offset_global: args.chunk.end_offset,
          },
    },
    {
      job_id: args.job.id,
      script_id: args.job.script_id,
      version_id: args.job.version_id,
      chunk_id: args.chunk.id,
      chunk_index: args.chunk.chunk_index,
      dedupe_key: `chunk:${args.chunk.id}:staged`,
      scope_level: "chunk",
      unit_type: "memory2_staged_bundle",
      memory_version: MEMORY2_VERSION,
      payload: args.stageBundle,
      source_offsets: {
        chunk_start_offset_global: args.chunk.start_offset,
        chunk_end_offset_global: args.chunk.end_offset,
      },
    },
  ];

  const { error: unitsErr } = await supabase
    .from("analysis_memory_units")
    .upsert(unitRows, { onConflict: "job_id,dedupe_key" });

  if (unitsErr) {
    logger.warn("Memory2 units upsert failed", {
      jobId: args.job.id,
      chunkId: args.chunk.id,
      error: unitsErr.message,
    });
  }

  const traceRow = {
    job_id: args.job.id,
    script_id: args.job.script_id,
    version_id: args.job.version_id,
    chunk_id: args.chunk.id,
    chunk_index: args.chunk.chunk_index,
    pass_name: "v2_context_assembly",
    memory_version: MEMORY2_VERSION,
    trace_payload: {
      analysis_memory_mode: "memory2",
      has_script_summary: Boolean(args.scriptMemory.summary),
      detected_scene_count: args.sceneMemory.detectedSceneCount,
      speaker_hints: args.contextEnvelope.memory.speakerHints,
      prompt_context_chars: args.promptContext.length,
      stage_used_chars: args.stageBundle.usedChars,
      stage_budgets: args.stageBundle.budgets,
      previous_chunk_index: args.contextEnvelope.memory.previousChunkIndex,
      next_chunk_index: args.contextEnvelope.memory.nextChunkIndex,
    },
  };

  const { error: traceErr } = await supabase
    .from("analysis_memory_traces")
    .upsert(traceRow, { onConflict: "job_id,chunk_id,pass_name" });

  if (traceErr) {
    logger.warn("Memory2 trace upsert failed", {
      jobId: args.job.id,
      chunkId: args.chunk.id,
      error: traceErr.message,
    });
  }
}
