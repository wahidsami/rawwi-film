import { config } from "./config.js";

export type AnalysisJobSize = {
  textLength?: number | null;
  chunkCount?: number | null;
};

export function isLargeAnalysisJob(size: AnalysisJobSize): boolean {
  const textLength = size.textLength ?? 0;
  const chunkCount = size.chunkCount ?? 0;
  return (
    textLength >= config.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD ||
    chunkCount >= config.ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD
  );
}

export function shouldSkipScriptSummaryForJob(size: AnalysisJobSize): boolean {
  return config.ANALYSIS_SKIP_SCRIPT_SUMMARY_ON_LARGE_JOBS && isLargeAnalysisJob(size);
}

export function shouldSkipRevisitForJob(size: AnalysisJobSize): boolean {
  return config.ANALYSIS_SKIP_REVISIT_ON_LARGE_JOBS && isLargeAnalysisJob(size);
}

export function shouldSkipDeepAuditorForJob(size: AnalysisJobSize): boolean {
  return config.ANALYSIS_SKIP_DEEP_AUDITOR_ON_LARGE_JOBS && isLargeAnalysisJob(size);
}
