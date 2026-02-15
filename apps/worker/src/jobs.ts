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
};

/**
 * Pick oldest job with status in ('queued','running') that has at least one pending chunk.
 * Prefer queued over running.
 */
export async function fetchNextJob(): Promise<AnalysisJob | null> {
  const { data: queued } = await supabase
    .from("analysis_jobs")
    .select("id, script_id, version_id, status, progress_total, progress_done, started_at")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (!queued?.length) return null;

  for (const job of queued) {
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
 * Atomically set chunk to 'judging' only if currently 'pending'. Returns updated row or null.
 * If job.started_at is null, set job to status='running' and started_at=now().
 */
export async function claimChunk(chunkId: string): Promise<AnalysisChunk | null> {
  const { data: updated } = await supabase
    .from("analysis_chunks")
    .update({ status: "judging" })
    .eq("id", chunkId)
    .eq("status", "pending")
    .select("id, job_id, chunk_index, text, start_offset, end_offset, start_line, end_line, status")
    .single();

  if (!updated) return null;

  const jobId = (updated as AnalysisChunk).job_id;
  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("started_at")
    .eq("id", jobId)
    .single();

  if (job && job.started_at == null) {
    await supabase
      .from("analysis_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
    logger.info("Job started", { jobId });
    logAuditEvent(supabase, {
      event_type: "ANALYSIS_STARTED",
      target_type: "task",
      target_id: jobId,
      target_label: jobId,
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
  await supabase.from("analysis_chunks").update({ status: "done" }).eq("id", chunkId);
}

export async function setChunkFailed(chunkId: string, lastError: string): Promise<void> {
  await supabase
    .from("analysis_chunks")
    .update({ status: "failed", last_error: lastError })
    .eq("id", chunkId);
}

/**
 * True if any chunk for job has status in ('pending','judging').
 */
export async function jobHasActiveChunks(jobId: string): Promise<boolean> {
  const { count } = await supabase
    .from("analysis_chunks")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["pending", "judging"]);
  return (count ?? 0) > 0;
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
