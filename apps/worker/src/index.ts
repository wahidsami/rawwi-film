import "dotenv/config";
import { runAggregation } from "./aggregation.js";
import { config } from "./config.js";
import { supabase } from "./db.js";
import {
  fetchNextJob,
  fetchNextAggregationCandidateJob,
  fetchNextPendingChunk,
  fetchNextPendingChunks,
  claimChunk,
  fetchJobNormalizedText,
  setJobFailed,
  setChunkPending,
  setChunkFailed,
  recoverStaleJudgingChunks,
  fetchNextPendingExtractionVersion,
  setExtractionFailed,
  notifyAdminAiOverload,
} from "./jobs.js";
import { setContext, logger } from "./logger.js";
import { initializeLexiconCache, getLexiconCache } from "./lexiconCache.js";
import { processChunkJudge } from "./pipeline.js";
import { processPdfExtraction } from "./pdfExtraction.js";

type ChunkProcessResult = {
  ok: boolean;
  retryable: boolean;
  error?: string;
};

const AI_OVERLOAD_PUBLIC_MESSAGE = "Raawi AI overloading issue, code 101";
const AI_OVERLOAD_RETRY_MARKER = "__ai_overload_retry:";
const CHUNK_TIMEOUT_REQUEUED_PUBLIC_MESSAGE = "Analysis chunk timed out and was re-queued";
const CHUNK_TIMEOUT_FAILED_PUBLIC_MESSAGE = "Analysis chunk timed out repeatedly and the job failed";
const CHUNK_TIMEOUT_RETRY_MARKER = "__chunk_timeout_retry:";

let lastLexiconRefreshJobId: string | null = null;

function getRuntimeConfigLogPayload() {
  return {
    routerModel: config.OPENAI_ROUTER_MODEL,
    judgeModel: config.OPENAI_JUDGE_MODEL,
    auditorModel: config.OPENAI_AUDITOR_MODEL,
    rationaleModel: config.OPENAI_RATIONALE_MODEL,
    judgeTimeoutMs: config.JUDGE_TIMEOUT_MS,
    passHardTimeoutMs: config.PASS_HARD_TIMEOUT_MS,
    hybridHardTimeoutMs: config.HYBRID_HARD_TIMEOUT_MS,
    chunkHardTimeoutMs: config.CHUNK_HARD_TIMEOUT_MS,
    chunkHardTimeoutMaxRetries: config.CHUNK_HARD_TIMEOUT_MAX_RETRIES,
    aiOverloadMaxRetries: config.AI_OVERLOAD_MAX_RETRIES,
    pollIntervalMs: config.POLL_INTERVAL_MS,
    staleJudgingMs: config.STALE_JUDGING_MS,
    chunkConcurrency: config.WORKER_CHUNK_CONCURRENCY,
    highRecall: config.HIGH_RECALL,
    deterministicMode: config.DETERMINISTIC_MODE,
    analysisEngine: config.ANALYSIS_ENGINE,
    analysisHybridMode: config.ANALYSIS_HYBRID_MODE,
    analysisEvalLog: config.ANALYSIS_EVAL_LOG,
    analysisDeepAuditor: config.ANALYSIS_DEEP_AUDITOR,
    largeJobChunkThreshold: config.ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD,
    largeJobTextLengthThreshold: config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD,
    passGatingEnabled: config.ANALYSIS_PASS_GATING_ENABLED,
    skipScriptSummaryOnLargeJobs: config.ANALYSIS_SKIP_SCRIPT_SUMMARY_ON_LARGE_JOBS,
    skipRevisitOnLargeJobs: config.ANALYSIS_SKIP_REVISIT_ON_LARGE_JOBS,
    skipDeepAuditorOnLargeJobs: config.ANALYSIS_SKIP_DEEP_AUDITOR_ON_LARGE_JOBS,
    extractStripRepeatedHeaders: config.EXTRACT_STRIP_REPEATED_HEADERS,
  };
}

function isAiOverloadIssue(errorMessage: string): boolean {
  return /429|rate limit|tokens per min|requests per min|insufficient[_\s-]?quota|quota|credit|billing|timeout|timed out|etimedout|fetch failed|socket hang up|connection error|overloaded|service unavailable|temporarily unavailable|server overloaded|api key|unauthorized|authentication/i.test(
    errorMessage,
  );
}

function getAiOverloadRetryCount(lastError: string | null | undefined): number {
  if (!lastError) return 0;
  const match = lastError.match(/__ai_overload_retry:(\d+)__/i);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function encodeAiOverloadRetry(rawError: string, retryCount: number): string {
  return `${AI_OVERLOAD_RETRY_MARKER}${retryCount}__ ${rawError}`.trim();
}

function getChunkTimeoutRetryCount(lastError: string | null | undefined): number {
  if (!lastError) return 0;
  const match = lastError.match(/__chunk_timeout_retry:(\d+)__/i);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function encodeChunkTimeoutRetry(rawError: string, retryCount: number): string {
  return `${CHUNK_TIMEOUT_RETRY_MARKER}${retryCount}__ ${rawError}`.trim();
}

class ChunkTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChunkTimeoutError";
  }
}

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

async function processClaimedChunk(
  job: { id: string; script_id: string; version_id: string },
  claimed: { id: string; last_error?: string | null },
  normalizedText: string | null,
): Promise<ChunkProcessResult> {
  setContext({ jobId: job.id, chunkId: claimed.id });
  const abortController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new ChunkTimeoutError(
          `Chunk exceeded hard timeout of ${config.CHUNK_HARD_TIMEOUT_MS}ms`,
        );
        abortController.abort(error);
        reject(error);
      }, config.CHUNK_HARD_TIMEOUT_MS);
    });
    await Promise.race([
      processChunkJudge(job as any, claimed as any, normalizedText, abortController.signal),
      timeoutPromise,
    ]);
    return { ok: true, retryable: false };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === "JobCancelledError") {
      logger.info("Chunk processing cancelled by user", {
        jobId: job.id,
        chunkId: claimed.id,
      });
      return { ok: false, retryable: false, error: errMsg };
    }
    const timeoutReason = abortController.signal.reason;
    const isChunkTimeout =
      (e instanceof Error && e.name === "ChunkTimeoutError") ||
      (e instanceof Error &&
        e.name === "AbortError" &&
        timeoutReason instanceof Error &&
        timeoutReason.name === "ChunkTimeoutError");
    if (isChunkTimeout) {
      const retryCount = getChunkTimeoutRetryCount(claimed.last_error) + 1;
      if (retryCount <= config.CHUNK_HARD_TIMEOUT_MAX_RETRIES) {
        logger.warn("Chunk processing exceeded hard timeout; re-queueing chunk", {
          jobId: job.id,
          chunkId: claimed.id,
          retryCount,
          maxRetries: config.CHUNK_HARD_TIMEOUT_MAX_RETRIES,
          timeoutMs: config.CHUNK_HARD_TIMEOUT_MS,
        });
        await setChunkPending(claimed.id, encodeChunkTimeoutRetry(errMsg, retryCount));
        return { ok: false, retryable: true, error: CHUNK_TIMEOUT_REQUEUED_PUBLIC_MESSAGE };
      }

      logger.error("Chunk processing exceeded hard timeout retries", {
        jobId: job.id,
        chunkId: claimed.id,
        retryCount,
        maxRetries: config.CHUNK_HARD_TIMEOUT_MAX_RETRIES,
        timeoutMs: config.CHUNK_HARD_TIMEOUT_MS,
      });
      await setChunkFailed(claimed.id, CHUNK_TIMEOUT_FAILED_PUBLIC_MESSAGE);
      await setJobFailed(job.id, CHUNK_TIMEOUT_FAILED_PUBLIC_MESSAGE);
      return { ok: false, retryable: false, error: CHUNK_TIMEOUT_FAILED_PUBLIC_MESSAGE };
    }
    if (e instanceof Error && e.name === "OperationTimeoutError") {
      logger.error("Chunk processing hit internal operation timeout", {
        jobId: job.id,
        chunkId: claimed.id,
        error: errMsg,
      });
      await setChunkFailed(claimed.id, errMsg);
      await setJobFailed(job.id, errMsg);
      return { ok: false, retryable: false, error: errMsg };
    }
    if (isAiOverloadIssue(errMsg)) {
      const retryCount = getAiOverloadRetryCount(claimed.last_error) + 1;
      if (retryCount <= config.AI_OVERLOAD_MAX_RETRIES) {
        logger.warn("Chunk processing hit AI overload; re-queueing chunk", {
          jobId: job.id,
          chunkId: claimed.id,
          retryCount,
          maxRetries: config.AI_OVERLOAD_MAX_RETRIES,
          error: errMsg,
        });
        await setChunkPending(claimed.id, encodeAiOverloadRetry(errMsg, retryCount));
        return { ok: false, retryable: true, error: AI_OVERLOAD_PUBLIC_MESSAGE };
      }

      logger.error("Chunk processing failed after AI overload retries", {
        jobId: job.id,
        chunkId: claimed.id,
        retryCount,
        maxRetries: config.AI_OVERLOAD_MAX_RETRIES,
        error: errMsg,
      });
      await setChunkFailed(claimed.id, AI_OVERLOAD_PUBLIC_MESSAGE);
      const markedFailed = await setJobFailed(job.id, AI_OVERLOAD_PUBLIC_MESSAGE);
      if (markedFailed) {
        await notifyAdminAiOverload(job, AI_OVERLOAD_PUBLIC_MESSAGE, errMsg);
      }
      return { ok: false, retryable: false, error: AI_OVERLOAD_PUBLIC_MESSAGE };
    }
    logger.error("Chunk processing failed", { error: errMsg, jobId: job.id, chunkId: claimed.id });
    await setChunkFailed(claimed.id, errMsg);
    await setJobFailed(job.id, errMsg);
    return { ok: false, retryable: false, error: errMsg };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    abortController.abort();
  }
}

async function processOneJob(): Promise<boolean> {
  const extractionVersion = await fetchNextPendingExtractionVersion();
  if (extractionVersion) {
    setContext({});
    try {
      await processPdfExtraction(extractionVersion);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        logger.info("Backend PDF extraction cancelled", {
          versionId: extractionVersion.id,
          scriptId: extractionVersion.script_id,
        });
        return true;
      }
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("Backend PDF extraction failed", {
        versionId: extractionVersion.id,
        scriptId: extractionVersion.script_id,
        error: errMsg,
      });
      await setExtractionFailed(extractionVersion.id, errMsg);
    }
    return true;
  }

  const recoveredChunks = await recoverStaleJudgingChunks(config.STALE_JUDGING_MS);
  if (recoveredChunks > 0) {
    logger.info("Recovered stale judging chunks before polling next job", {
      recoveredChunks,
      staleJudgingMs: config.STALE_JUDGING_MS,
    });
  }

  const jobStartedAt = Date.now();
  const job = await fetchNextJob();
  if (!job) {
    const aggregationJob = await fetchNextAggregationCandidateJob();
    if (!aggregationJob) return false;
    setContext({ jobId: aggregationJob.id });
    try {
      await runAggregation(aggregationJob.id);
      logger.info("Recovered aggregation-only job", { jobId: aggregationJob.id });
      return true;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("Aggregation recovery failed", { jobId: aggregationJob.id, error: errMsg });
      await setJobFailed(aggregationJob.id, errMsg);
      return true;
    }
  }

  if (job.id !== lastLexiconRefreshJobId) {
    await getLexiconCache(supabase).refresh();
    lastLexiconRefreshJobId = job.id;
  }

  setContext({ jobId: job.id });
  const normalizedText = await fetchJobNormalizedText(job.id);
  const desiredConcurrency = config.WORKER_CHUNK_CONCURRENCY;
  const claimed = await claimChunkBatch(job.id, desiredConcurrency);
  if (claimed.length === 0) return false;

  logger.info("Worker runtime config for claimed job", {
    jobId: job.id,
    mode: "poll",
    ...getRuntimeConfigLogPayload(),
  });
  logger.info("Claimed chunk batch", {
    jobId: job.id,
    desiredConcurrency,
    claimedCount: claimed.length,
    chunkIndexes: claimed.map((chunk) => chunk.chunk_index),
  });

  const results = await Promise.all(claimed.map((chunk) => processClaimedChunk(job, chunk, normalizedText)));

  if (results.some((result) => !result.ok)) {
    logger.warn("Job batch incomplete; aggregation deferred", {
      jobId: job.id,
      desiredConcurrency,
      claimedCount: claimed.length,
      succeededCount: results.filter((result) => result.ok).length,
      retryableCount: results.filter((result) => !result.ok && result.retryable).length,
      failedCount: results.filter((result) => !result.ok && !result.retryable).length,
      batchDurationMs: Date.now() - jobStartedAt,
    });
    return true;
  }

  try {
    await runAggregation(job.id);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.error("Aggregation failed after batch", { jobId: job.id, error: errMsg });
    await setJobFailed(job.id, errMsg);
    return true;
  }
  logger.info("Job batch processed", {
    jobId: job.id,
    desiredConcurrency,
    claimedCount: claimed.length,
    succeededCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length,
    batchDurationMs: Date.now() - jobStartedAt,
  });
  return true;
}

function startStaleJudgingSweep(): ReturnType<typeof setInterval> {
  let running = false;
  return setInterval(() => {
    if (running) return;
    running = true;
    void recoverStaleJudgingChunks(config.STALE_JUDGING_MS)
      .then((recoveredChunks) => {
        if (recoveredChunks > 0) {
          logger.warn("Recovered stale judging chunks during watchdog sweep", {
            recoveredChunks,
            staleJudgingMs: config.STALE_JUDGING_MS,
          });
        }
      })
      .catch((error) => {
        logger.warn("Stale judging sweep failed", { error: String(error) });
      })
      .finally(() => {
        running = false;
      });
  }, config.STALE_JUDGING_SWEEP_INTERVAL_MS);
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
  const staleSweep = startStaleJudgingSweep();
  logger.info("Worker runtime config loaded", {
    mode: jobId ? "once" : "single-run",
    ...getRuntimeConfigLogPayload(),
  });

  try {
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
        if (claimed.length === 0) {
          try {
            await runAggregation(job.id);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            logger.error("Aggregation failed during worker:once idle finalize", { jobId: job.id, error: errMsg });
            await setJobFailed(job.id, errMsg);
          }
          break;
        }
        logger.info("Worker runtime config for claimed job", {
          jobId,
          mode: "once",
          ...getRuntimeConfigLogPayload(),
        });
        const results = await Promise.all(
          claimed.map((chunk) =>
            processClaimedChunk(job as { id: string; script_id: string; version_id: string }, chunk, normalizedText)
          )
        );
        processed += results.filter((result) => result.ok).length;
        if (results.some((result) => !result.ok)) continue;
        try {
          await runAggregation(job.id);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          logger.error("Aggregation failed during worker:once", { jobId: job.id, error: errMsg });
          await setJobFailed(job.id, errMsg);
          break;
        }
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
  } finally {
    clearInterval(staleSweep);
  }
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
  logger.info("Worker runtime config loaded", {
    mode: "dev",
    ...getRuntimeConfigLogPayload(),
  });
  const staleSweep = startStaleJudgingSweep();

  try {
    while (true) {
      setContext({});
      await processOneJob();
      await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS));
    }
  } finally {
    clearInterval(staleSweep);
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
