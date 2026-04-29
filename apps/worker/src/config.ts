/**
 * Worker env config. Load with dotenv in index or require env at startup.
 */
export const config = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_ROUTER_MODEL: process.env.OPENAI_ROUTER_MODEL ?? "gpt-4.1-mini",
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL ?? "gpt-4.1",
  OPENAI_AUDITOR_MODEL: process.env.OPENAI_AUDITOR_MODEL ?? "gpt-4.1",
  /** Model for rationale-only pass. Use gpt-4.1 by default (gpt-4o if your project has access). */
  OPENAI_RATIONALE_MODEL: process.env.OPENAI_RATIONALE_MODEL ?? "gpt-4.1",
  JUDGE_TIMEOUT_MS: parseInt(process.env.JUDGE_TIMEOUT_MS ?? "120000", 10),
  PASS_HARD_TIMEOUT_MS: Math.max(
    parseInt(process.env.PASS_HARD_TIMEOUT_MS ?? "180000", 10) || 180000,
    parseInt(process.env.JUDGE_TIMEOUT_MS ?? "120000", 10) || 120000
  ),
  CHUNK_HARD_TIMEOUT_MS: Math.max(
    parseInt(process.env.CHUNK_HARD_TIMEOUT_MS ?? "300000", 10) || 300000,
    parseInt(process.env.PASS_HARD_TIMEOUT_MS ?? "180000", 10) || 180000
  ),
  HYBRID_HARD_TIMEOUT_MS: Math.max(
    parseInt(process.env.HYBRID_HARD_TIMEOUT_MS ?? "240000", 10) || 240000,
    parseInt(process.env.JUDGE_TIMEOUT_MS ?? "120000", 10) || 120000
  ),
  CHUNK_HARD_TIMEOUT_MAX_RETRIES: Math.max(
    1,
    parseInt(process.env.CHUNK_HARD_TIMEOUT_MAX_RETRIES ?? "1", 10) || 1
  ),
  AI_OVERLOAD_MAX_RETRIES: Math.max(
    1,
    parseInt(process.env.AI_OVERLOAD_MAX_RETRIES ?? "3", 10) || 3
  ),
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS ?? "2000", 10),
  STALE_JUDGING_MS: Math.max(
    60_000,
    parseInt(process.env.STALE_JUDGING_MS ?? "600000", 10) || 600_000
  ),
  STALE_JUDGING_SWEEP_INTERVAL_MS: Math.max(
    15_000,
    parseInt(process.env.STALE_JUDGING_SWEEP_INTERVAL_MS ?? "30000", 10) || 30_000
  ),
  // Accept the legacy misnamed env key as a fallback so older deployments still get concurrency.
  WORKER_CHUNK_CONCURRENCY: Math.max(
    1,
    parseInt(process.env.WORKER_CHUNK_CONCURRENCY ?? process.env.export_WORKER_CHUNK_CONCURRENCY ?? "1", 10) || 1
  ),
  ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD: Math.max(1, parseInt(process.env.ANALYSIS_LARGE_JOB_CHUNK_THRESHOLD ?? "35", 10) || 35),
  ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD: Math.max(10_000, parseInt(process.env.ANALYSIS_LARGE_JOB_TEXT_LENGTH_THRESHOLD ?? "180000", 10) || 180000),
  ANALYSIS_PASS_GATING_ENABLED: (process.env.ANALYSIS_PASS_GATING_ENABLED ?? "true").toLowerCase() !== "false",
  LEXICON_REFRESH_MS: 2 * 60 * 1000,
  CHUNK_WINDOW_THRESHOLD: 10_000,
  MICRO_WINDOW_SIZE: 8_000,
  MICRO_WINDOW_OVERLAP: 800,
  OVERLAP_COLLAPSE_RATIO: 0.7,
  /** Bypass router and judge against all 25 articles. Set WORKER_HIGH_RECALL=true in .env */
  HIGH_RECALL: (process.env.WORKER_HIGH_RECALL ?? "").toLowerCase() === "true",
  /**
   * Deterministic mode defaults ON for production-safe repeatability.
   * Set DETERMINISTIC_MODE=false to opt out explicitly.
   */
  DETERMINISTIC_MODE: (process.env.DETERMINISTIC_MODE ?? "true").toLowerCase() !== "false",
  /**
   * Analysis engine:
   * - v2: existing detector-only behavior
   * - hybrid: detector + context arbiter + policy reasoner
   */
  ANALYSIS_ENGINE: ((process.env.ANALYSIS_ENGINE ?? "v2").toLowerCase() === "hybrid" ? "hybrid" : "v2") as "v2" | "hybrid",
  /**
   * Violation prompt pack:
   * - v2: current live prompts
   * - v3: new policy-driven prompt overlay built from the updated violation handbook
   */
  VIOLATION_SYSTEM_VERSION: ((process.env.VIOLATION_SYSTEM_VERSION ?? "v2").toLowerCase() === "v3" ? "v3" : "v2") as "v2" | "v3",
  /**
   * Pipeline version:
   * - v1: current production-safe pipeline
   * - v2: next-generation pipeline with staged rollout via job config
   */
  ANALYSIS_PIPELINE_VERSION: ((process.env.ANALYSIS_PIPELINE_VERSION ?? "v1").toLowerCase() === "v2" ? "v2" : "v1") as "v1" | "v2",
  /**
   * Hybrid run mode:
   * - enforce: hybrid output is persisted
   * - shadow: run hybrid for evaluation, persist baseline v2 output
   */
  ANALYSIS_HYBRID_MODE: ((process.env.ANALYSIS_HYBRID_MODE ?? "shadow").toLowerCase() === "enforce" ? "enforce" : "shadow") as "shadow" | "enforce",
  /**
   * Persist evaluation comparison rows for hybrid rollout KPIs.
   */
  ANALYSIS_EVAL_LOG: (process.env.ANALYSIS_EVAL_LOG ?? "true").toLowerCase() !== "false",
  /**
   * Enable deep GPT auditor pass for canonical findings.
   * Runs inside hybrid flow; safe default enabled.
   */
  ANALYSIS_DEEP_AUDITOR: (process.env.ANALYSIS_DEEP_AUDITOR ?? "true").toLowerCase() !== "false",
  /**
   * Auditor layer:
   * - v2: existing behavior without deterministic v3 verification gate
   * - v3: deterministic hard verifier after the deep auditor pass
   */
  AUDITOR_LAYER_VERSION: ((process.env.AUDITOR_LAYER_VERSION ?? "v3").toLowerCase() === "v2" ? "v2" : "v3") as "v2" | "v3",
  /**
   * Large-job gating:
   * - summary/revisit default to skip on very large jobs
   * - deep auditor skip is opt-in because it can change final persisted rulings
   */
  ANALYSIS_SKIP_SCRIPT_SUMMARY_ON_LARGE_JOBS: (process.env.ANALYSIS_SKIP_SCRIPT_SUMMARY_ON_LARGE_JOBS ?? "true").toLowerCase() !== "false",
  ANALYSIS_SKIP_REVISIT_ON_LARGE_JOBS: (process.env.ANALYSIS_SKIP_REVISIT_ON_LARGE_JOBS ?? "true").toLowerCase() !== "false",
  ANALYSIS_SKIP_DEEP_AUDITOR_ON_LARGE_JOBS: (process.env.ANALYSIS_SKIP_DEEP_AUDITOR_ON_LARGE_JOBS ?? "false").toLowerCase() === "true",
  EXTRACT_STRIP_REPEATED_HEADERS: (process.env.EXTRACT_STRIP_REPEATED_HEADERS ?? "false").toLowerCase() === "true",
} as const;
