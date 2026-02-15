/**
 * Worker env config. Load with dotenv in index or require env at startup.
 */
export const config = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_ROUTER_MODEL: process.env.OPENAI_ROUTER_MODEL ?? "gpt-4.1-mini",
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL ?? "gpt-4.1",
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
} as const;
