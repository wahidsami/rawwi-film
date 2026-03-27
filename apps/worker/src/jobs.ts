import { supabase } from "./db.js";
import { logger } from "./logger.js";
import { logAuditEvent } from "./audit.js";

export type AnalysisJob = {
  id: string;
  script_id: string;
  version_id: string;
  status: string;
  progress_total: number;
  progress_done: number;
  started_at: string | null;
  pause_requested?: boolean;
  paused_at?: string | null;
  partial_finalize_requested?: boolean;
  partial_finalize_requested_at?: string | null;
  config_snapshot?: any;
};

export type AnalysisChunk = {
  id: string;
  job_id: string;
  chunk_index: number;
  text: string;
  start_offset: number;
  end_offset: number;
  start_line: number;
  end_line: number;
  status: string;
  judging_started_at?: string | null;
};

async function fetchCandidateJobsBase(): Promise<AnalysisJob[]> {
  const selectWithControls =
    "id, script_id, version_id, status, progress_total, progress_done, started_at, pause_requested, paused_at, partial_finalize_requested, partial_finalize_requested_at";
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(selectWithControls)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (!error) return (data ?? []) as AnalysisJob[];

  logger.warn("analysis_jobs control columns unavailable; falling back to legacy job query", {
    error: error.message,
  });

  const { data: legacyData, error: legacyError } = await supabase
    .from("analysis_jobs")
    .select("id, script_id, version_id, status, progress_total, progress_done, started_at")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (legacyError) {
    logger.error("Failed to fetch candidate jobs", { error: legacyError.message });
    return [];
  }

  return (legacyData ?? []) as AnalysisJob[];
}

async function fetchJobControlState(jobId: string): Promise<{
  started_at: string | null;
  created_by?: string | null;
  pause_requested?: boolean | null;
  partial_finalize_requested?: boolean | null;
} | null> {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select("started_at, created_by, pause_requested, partial_finalize_requested")
    .eq("id", jobId)
    .single();

  if (!error) {
    return data as {
      started_at: string | null;
      created_by?: string | null;
      pause_requested?: boolean | null;
      partial_finalize_requested?: boolean | null;
    };
  }

  logger.warn("analysis_jobs control state unavailable; falling back to legacy job state query", {
    jobId,
    error: error.message,
  });

  const { data: legacyData, error: legacyError } = await supabase
    .from("analysis_jobs")
    .select("started_at, created_by")
    .eq("id", jobId)
    .single();

  if (legacyError) {
    logger.error("Failed to fetch job state", { jobId, error: legacyError.message });
    return null;
  }

  return legacyData as { started_at: string | null; created_by?: string | null };
}

/**
 * Pick oldest job with status in ('queued','running') that has at least one pending chunk.
 * Prefer queued over running.
 */
export async function fetchNextJob(): Promise<AnalysisJob | null> {
  const queued = await fetchCandidateJobsBase();

  if (!queued?.length) return null;

  for (const job of queued) {
    if (job.pause_requested === true || job.partial_finalize_requested === true) continue;
    const { count } = await supabase
      .from("analysis_chunks")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "pending");
    if (count && count > 0) return job as AnalysisJob;
  }
  return null;
}

/**
 * Oldest running job that has no active chunks left.
 * Used to recover jobs that got stuck during aggregation/finalization.
 */
export async function fetchNextAggregationCandidateJob(): Promise<AnalysisJob | null> {
  const running = await fetchCandidateJobsBase();

  if (!running?.length) return null;

  for (const job of running) {
    if (job.pause_requested) continue;
    const statuses = job.partial_finalize_requested ? ["judging"] : ["pending", "judging", "failed"];
    const { count } = await supabase
      .from("analysis_chunks")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .in("status", statuses);
    if ((count ?? 0) === 0) return job as AnalysisJob;
  }

  return null;
}

/**
 * Earliest chunk for job with status='pending'.
 */
export async function fetchNextPendingChunk(jobId: string): Promise<AnalysisChunk | null> {
  const { data } = await supabase
    .from("analysis_chunks")
    .select("id, job_id, chunk_index, text, start_offset, end_offset, start_line, end_line, status")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("chunk_index", { ascending: true })
    .limit(1)
    .single();
  return data as AnalysisChunk | null;
}

/**
 * Earliest N pending chunks for a job, ordered by chunk_index.
 */
export async function fetchNextPendingChunks(jobId: string, limit: number): Promise<AnalysisChunk[]> {
  const safeLimit = Math.max(1, limit);
  const { data } = await supabase
    .from("analysis_chunks")
    .select("id, job_id, chunk_index, text, start_offset, end_offset, start_line, end_line, status")
    .eq("job_id", jobId)
    .eq("status", "pending")
    .order("chunk_index", { ascending: true })
    .limit(safeLimit);
  return (data ?? []) as AnalysisChunk[];
}

/**
 * Atomically set chunk to 'judging' only if currently 'pending'. Returns updated row or null.
 * If job.started_at is null, set job to status='running' and started_at=now().
 */
export async function claimChunk(chunkId: string): Promise<AnalysisChunk | null> {
  const { data: updated } = await supabase
    .from("analysis_chunks")
    .update({ status: "judging", judging_started_at: new Date().toISOString() })
    .eq("id", chunkId)
    .eq("status", "pending")
    .select("id, job_id, chunk_index, text, start_offset, end_offset, start_line, end_line, status, judging_started_at")
    .single();

  if (!updated) return null;

  const jobId = (updated as AnalysisChunk).job_id;
  const job = await fetchJobControlState(jobId);

  if (job && (
    (job as { pause_requested?: boolean | null }).pause_requested === true ||
    (job as { partial_finalize_requested?: boolean | null }).partial_finalize_requested === true
  )) {
    await setChunkPending(chunkId, null);
    return null;
  }

  if (job && (job as { started_at: string | null }).started_at == null) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
    logger.info("Job started", { jobId });
    const jobRow = job as { started_at: string | null; created_by?: string | null };
    logAuditEvent(supabase, {
      event_type: "ANALYSIS_STARTED",
      target_type: "task",
      target_id: jobId,
      target_label: jobId,
      actor_user_id: jobRow.created_by ?? null,
    }).catch(() => { });
  }

  return updated as AnalysisChunk;
}

/**
 * progress_done += 1, progress_percent = floor(100 * progress_done / progress_total).
 */
export async function incrementJobProgress(jobId: string): Promise<void> {
  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("progress_done, progress_total")
    .eq("id", jobId)
    .single();
  if (!job) return;
  const done = (job.progress_done ?? 0) + 1;
  const total = Math.max(1, job.progress_total ?? 1);
  const percent = Math.floor((100 * done) / total);
  await supabase
    .from("analysis_jobs")
    .update({ progress_done: done, progress_percent: percent })
    .eq("id", jobId);
}

/**
 * Mark chunk as done or failed.
 */
export async function setChunkDone(chunkId: string): Promise<void> {
  await supabase
    .from("analysis_chunks")
    .update({
      status: "done",
      judging_started_at: null,
      processing_phase: null,
      passes_completed: 0,
    })
    .eq("id", chunkId);
}

export async function setChunkFailed(chunkId: string, lastError: string): Promise<void> {
  await supabase
    .from("analysis_chunks")
    .update({ status: "failed", last_error: lastError, judging_started_at: null, processing_phase: null })
    .eq("id", chunkId);
}

export async function setChunkPending(chunkId: string, lastError: string | null = null): Promise<void> {
  await supabase
    .from("analysis_chunks")
    .update({
      status: "pending",
      last_error: lastError,
      judging_started_at: null,
      processing_phase: null,
      passes_completed: 0,
    })
    .eq("id", chunkId);
}

export async function setJobFailed(jobId: string, errorMessage: string): Promise<void> {
  await supabase
    .from("analysis_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/** Fire-and-forget UI phase label (does not block LLM work). */
export function setChunkPhase(chunkId: string, phase: string): void {
  void supabase
    .from("analysis_chunks")
    .update({ processing_phase: phase })
    .eq("id", chunkId)
    .then(({ error }) => {
      if (error) logger.warn("setChunkPhase failed", { chunkId, phase, err: error.message });
    });
}

/** Reset pass counters when entering multi-pass detection. */
export function setChunkMultipassStart(chunkId: string, totalPasses: number): void {
  void supabase
    .from("analysis_chunks")
    .update({
      processing_phase: "multipass",
      passes_completed: 0,
      passes_total: totalPasses,
    })
    .eq("id", chunkId)
    .then(({ error }) => {
      if (error) logger.warn("setChunkMultipassStart failed", { chunkId, err: error.message });
    });
}

const passProgressDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced pass counter for parallel detectors (~280ms coalesce). */
export function reportChunkPassProgressDebounced(chunkId: string, completed: number, total: number): void {
  const prev = passProgressDebounceTimers.get(chunkId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    passProgressDebounceTimers.delete(chunkId);
    void supabase
      .from("analysis_chunks")
      .update({ passes_completed: completed, passes_total: total })
      .eq("id", chunkId)
      .then(({ error }) => {
        if (error) logger.warn("reportChunkPassProgress failed", { chunkId, err: error.message });
      });
  }, 280);
  passProgressDebounceTimers.set(chunkId, t);
}

/** Final flush so UI shows 10/10 before chunk completes. */
export function flushChunkPassProgress(chunkId: string, completed: number, total: number): void {
  const prev = passProgressDebounceTimers.get(chunkId);
  if (prev) clearTimeout(prev);
  passProgressDebounceTimers.delete(chunkId);
  void supabase
    .from("analysis_chunks")
    .update({ passes_completed: completed, passes_total: total })
    .eq("id", chunkId)
    .then(({ error }) => {
      if (error) logger.warn("flushChunkPassProgress failed", { chunkId, err: error.message });
    });
}

/**
 * True if any chunk for job is not fully done yet.
 */
export async function jobHasActiveChunks(jobId: string): Promise<boolean> {
  const { count } = await supabase
    .from("analysis_chunks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["pending", "judging", "failed"]);
  return (count ?? 0) > 0;
}

export async function jobHasInFlightChunks(jobId: string): Promise<boolean> {
  const { count } = await supabase
    .from("analysis_chunks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "judging");
  return (count ?? 0) > 0;
}

export async function countChunksWithStatuses(jobId: string, statuses: string[]): Promise<number> {
  const { count } = await supabase
    .from("analysis_chunks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", statuses);
  return count ?? 0;
}

export async function recoverStaleJudgingChunks(maxAgeMs: number): Promise<number> {
  const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();
  const { data, error } = await supabase
    .from("analysis_chunks")
    .select("id, job_id, chunk_index, judging_started_at")
    .eq("status", "judging")
    .not("judging_started_at", "is", null)
    .lt("judging_started_at", cutoffIso)
    .order("judging_started_at", { ascending: true })
    .limit(20);

  if (error) {
    logger.warn("Failed to query stale judging chunks", { error: error.message, cutoffIso });
    return 0;
  }

  const staleChunks = (data ?? []) as Array<{
    id: string;
    job_id: string;
    chunk_index: number;
    judging_started_at?: string | null;
  }>;

  if (!staleChunks.length) return 0;

  let recovered = 0;
  for (const chunk of staleChunks) {
    const jobState = await fetchJobControlState(chunk.job_id);
    const message = (jobState as { partial_finalize_requested?: boolean | null } | null)?.partial_finalize_requested
      ? "Recovered stale judging chunk during partial finalization"
      : "Recovered stale judging chunk and re-queued it";

    if ((jobState as { partial_finalize_requested?: boolean | null } | null)?.partial_finalize_requested) {
      await setChunkFailed(chunk.id, message);
      logger.warn("Stale judging chunk failed for partial finalize recovery", {
        jobId: chunk.job_id,
        chunkId: chunk.id,
        chunkIndex: chunk.chunk_index,
        judgingStartedAt: chunk.judging_started_at ?? null,
      });
    } else {
      await setChunkPending(chunk.id, message);
      logger.warn("Stale judging chunk returned to pending", {
        jobId: chunk.job_id,
        chunkId: chunk.id,
        chunkIndex: chunk.chunk_index,
        judgingStartedAt: chunk.judging_started_at ?? null,
      });
    }
    recovered += 1;
  }

  return recovered;
}

/**
 * Fetch the canonical normalized text for a job. Used to derive finding excerpt from global offsets.
 */
export async function fetchJobNormalizedText(jobId: string): Promise<string | null> {
  const { data } = await supabase
    .from("analysis_jobs")
    .select("normalized_text")
    .eq("id", jobId)
    .maybeSingle();
  const text = (data as { normalized_text?: string | null } | null)?.normalized_text;
  return text != null && text.length > 0 ? text : null;
}
