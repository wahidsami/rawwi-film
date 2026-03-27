import "dotenv/config";
import { runAggregation } from "./aggregation.js";
import { config } from "./config.js";
import { supabase } from "./db.js";
import {
  fetchNextJob,
  fetchNextPendingChunk,
  fetchNextPendingChunks,
  claimChunk,
  fetchJobNormalizedText,
  incrementJobProgress,
} from "./jobs.js";
import { setContext, logger } from "./logger.js";
import { initializeLexiconCache, getLexiconCache } from "./lexiconCache.js";
import { processChunkJudge } from "./pipeline.js";
import { setChunkFailed } from "./jobs.js";

let lastLexiconRefreshJobId: string | null = null;

async function claimChunkBatch(jobId: string, desired: number) {
  const claimed = [];
  let attempts = 0;
  const maxAttempts = Math.max(1, desired * 3);

  while (claimed.length < desired && attempts < maxAttempts) {
    attempts++;
    const remaining = desired - claimed.length;
    const pending = claimed.length === 0
      ? await fetchNextPendingChunks(jobId, remaining)
      : [await fetchNextPendingChunk(jobId)].filter(Boolean);
    if (!pending.length) break;

    for (const chunk of pending) {
      if (!chunk) continue;
      const got = await claimChunk(chunk.id);
      if (got) claimed.push(got);
      if (claimed.length >= desired) break;
    }
  }

  return claimed;
}

async function processClaimedChunk(job: { id: string; script_id: string; version_id: string }, claimed: { id: string }, normalizedText: string | null): Promise<boolean> {
  setContext({ jobId: job.id, chunkId: claimed.id });
  try {
    await processChunkJudge(job as any, claimed as any, normalizedText);
    return true;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error("Chunk processing failed", { error: errMsg, jobId: job.id, chunkId: claimed.id });
    await setChunkFailed(claimed.id, errMsg);
    await incrementJobProgress(job.id);
    return false;
  }
}

async function processOneJob(): Promise<boolean> {
  const jobStartedAt = Date.now();
  const job = await fetchNextJob();
  if (!job) return false;

  if (job.id !== lastLexiconRefreshJobId) {
    await getLexiconCache(supabase).refresh();
    lastLexiconRefreshJobId = job.id;
  }

  setContext({ jobId: job.id });
  const normalizedText = await fetchJobNormalizedText(job.id);
  const desiredConcurrency = config.WORKER_CHUNK_CONCURRENCY;
  const claimed = await claimChunkBatch(job.id, desiredConcurrency);
  if (claimed.length === 0) return false;

  logger.info("Claimed chunk batch", {
    jobId: job.id,
    desiredConcurrency,
    claimedCount: claimed.length,
    chunkIndexes: claimed.map((chunk) => chunk.chunk_index),
  });

  const results = await Promise.all(claimed.map((chunk) => processClaimedChunk(job, chunk, normalizedText)));

  await runAggregation(job.id);
  logger.info("Job batch processed", {
    jobId: job.id,
    desiredConcurrency,
    claimedCount: claimed.length,
    succeededCount: results.filter(Boolean).length,
    failedCount: results.filter((ok) => !ok).length,
    batchDurationMs: Date.now() - jobStartedAt,
  });
  return true;
}

async function runOnce(jobId: string | undefined): Promise<void> {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!config.OPENAI_API_KEY) {
    logger.warn("OPENAI_API_KEY not set; Router/Judge will fail");
  }

  await initializeLexiconCache(supabase);

  if (jobId) {
    const { data: job } = await supabase
      .from("analysis_jobs")
      .select("id, script_id, version_id, status, progress_total, progress_done, started_at")
      .eq("id", jobId)
      .single();
    if (!job) {
      logger.error("Job not found", { jobId });
      process.exit(1);
    }
    setContext({ jobId: job.id });
    await getLexiconCache(supabase).refresh();
    const normalizedText = await fetchJobNormalizedText(jobId);
    let processed = 0;
    while (true) {
      const claimed = await claimChunkBatch(jobId, config.WORKER_CHUNK_CONCURRENCY);
      if (claimed.length === 0) break;
      const results = await Promise.all(
        claimed.map((chunk) =>
          processClaimedChunk(job as { id: string; script_id: string; version_id: string }, chunk, normalizedText)
        )
      );
      processed += results.filter(Boolean).length;
      await runAggregation(job.id);
    }
    logger.info("worker:once finished", {
      jobId,
      chunksProcessed: processed,
      chunkConcurrency: config.WORKER_CHUNK_CONCURRENCY,
    });
    return;
  }

  const didWork = await processOneJob();
  if (!didWork) logger.info("No job or chunk available");
}

async function runDev(): Promise<never> {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!config.OPENAI_API_KEY) {
    logger.warn("OPENAI_API_KEY not set; Router/Judge will fail");
  }

  await initializeLexiconCache(supabase);
  logger.info("Worker dev loop started", {
    pollIntervalMs: config.POLL_INTERVAL_MS,
    chunkConcurrency: config.WORKER_CHUNK_CONCURRENCY,
  });

  while (true) {
    setContext({});
    await processOneJob();
    await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS));
  }
}

const mode = process.argv[2];
const jobId = process.argv[3] === "--job" ? process.argv[4] : undefined;

if (mode === "once") {
  runOnce(jobId).then(
    () => process.exit(0),
    (e) => {
      logger.error("Fatal", { error: String(e) });
      process.exit(1);
    }
  );
} else if (mode === "dev") {
  runDev().catch((e) => {
    logger.error("Fatal", { error: String(e) });
    process.exit(1);
  });
} else {
  console.log("Usage: pnpm worker:dev | pnpm worker:once [--job <jobId>]");
  process.exit(1);
}
