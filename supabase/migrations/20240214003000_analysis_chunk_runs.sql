-- Migration: Create analysis_chunk_runs table
-- Description: Stores atomic execution results for strict idempotency and caching.

CREATE TABLE IF NOT EXISTS analysis_chunk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL, -- sha256(chunk_text + config_snapshot + logic_version)
  job_id uuid REFERENCES analysis_jobs(id) ON DELETE SET NULL, -- for debugging/traceability
  router_candidates jsonb, -- store for potential judge-only reruns
  ai_findings jsonb, -- final judge output
  created_at timestamptz DEFAULT now()
);

-- Unique index to enforce idempotency and allow fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_chunk_runs_key ON analysis_chunk_runs(run_key);

-- Index on job_id for debugging queries
CREATE INDEX IF NOT EXISTS idx_analysis_chunk_runs_job ON analysis_chunk_runs(job_id);

COMMENT ON TABLE analysis_chunk_runs IS 'Immutable audit log and cache for analysis chunk executions (idempotency store).';
