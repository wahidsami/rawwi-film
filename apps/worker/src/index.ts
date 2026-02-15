import "dotenv/config";
import { runAggregation } from "./aggregation.js";
import { config } from "./config.js";
import { supabase } from "./db.js";
import { fetchNextJob, fetchNextPendingChunk, claimChunk } from "./jobs.js";
import { setContext, logger } from "./logger.js";
import { initializeLexiconCache } from "./lexiconCache.js";
import { processChunkJudge } from "./pipeline.js";
import { setChunkFailed } from "./jobs.js";

async function processOneJob(): Promise<boolean> {
  const job = await fetchNextJob();
  if (!job) return false;

  setContext({ jobId: job.id });
  const chunk = await fetchNextPendingChunk(job.id);
  if (!chunk) return false;

  const claimed = await claimChunk(chunk.id);
  if (!claimed) return false;

  const { fetchJobNormalizedText } = await import("./jobs.js");
  const normalizedText = await fetchJobNormalizedText(job.id);

  setContext({ jobId: job.id, chunkId: chunk.id });
  try {
    await processChunkJudge(job, claimed, normalizedText);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error("Chunk processing failed", { error: errMsg });
    await setChunkFailed(claimed.id, errMsg);
    const { incrementJobProgress } = await import("./jobs.js");
    await incrementJobProgress(job.id);
  }

  await runAggregation(job.id);
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
    let processed = 0;
    while (true) {
      const chunk = await fetchNextPendingChunk(jobId);
      if (!chunk) break;
      const claimed = await claimChunk(chunk.id);
      if (!claimed) break;
      setContext({ jobId, chunkId: claimed.id });
      const { fetchJobNormalizedText } = await import("./jobs.js");
      const normalizedText = await fetchJobNormalizedText(jobId);
      try {
        await processChunkJudge(job as { id: string; script_id: string; version_id: string }, claimed, normalizedText);
        processed++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error("Chunk processing failed", { error: errMsg });
        await setChunkFailed(claimed.id, errMsg);
        const { incrementJobProgress } = await import("./jobs.js");
        await incrementJobProgress(job.id);
      }
      await runAggregation(job.id);
    }
    logger.info("worker:once finished", { jobId, chunksProcessed: processed });
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
  logger.info("Worker dev loop started", { pollIntervalMs: config.POLL_INTERVAL_MS });

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
