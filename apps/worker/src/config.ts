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
  /** Model for rationale-only second pass (why violation). Use gpt-4o for better Arabic reasoning. */
  OPENAI_RATIONALE_MODEL: process.env.OPENAI_RATIONALE_MODEL ?? "gpt-4o",
  JUDGE_TIMEOUT_MS: parseInt(process.env.JUDGE_TIMEOUT_MS ?? "120000", 10),
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS ?? "2000", 10),
  LEXICON_REFRESH_MS: 2 * 60 * 1000,
  CHUNK_WINDOW_THRESHOLD: 10_000,
  MICRO_WINDOW_SIZE: 8_000,
  MICRO_WINDOW_OVERLAP: 800,
  OVERLAP_COLLAPSE_RATIO: 0.7,
  /** Bypass router and judge against all 25 articles. Set WORKER_HIGH_RECALL=true in .env */
  HIGH_RECALL: (process.env.WORKER_HIGH_RECALL ?? "").toLowerCase() === "true",
  DETERMINISTIC_MODE: (process.env.DETERMINISTIC_MODE ?? "").toLowerCase() === "true",
  /**
   * Analysis engine:
   * - v2: existing detector-only behavior
   * - hybrid: detector + context arbiter + policy reasoner
   */
  ANALYSIS_ENGINE: ((process.env.ANALYSIS_ENGINE ?? "v2").toLowerCase() === "hybrid" ? "hybrid" : "v2") as "v2" | "hybrid",
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
} as const;
