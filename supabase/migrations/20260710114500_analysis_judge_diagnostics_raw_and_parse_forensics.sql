ALTER TABLE public.analysis_judge_diagnostics
  ADD COLUMN IF NOT EXISTS judge_model text NULL,
  ADD COLUMN IF NOT EXISTS finish_reason text NULL,
  ADD COLUMN IF NOT EXISTS openai_usage jsonb NULL,
  ADD COLUMN IF NOT EXISTS openai_response_id text NULL,
  ADD COLUMN IF NOT EXISTS raw_response_timestamp timestamptz NULL,
  ADD COLUMN IF NOT EXISTS parse_status text NULL,
  ADD COLUMN IF NOT EXISTS repair_reason text NULL,
  ADD COLUMN IF NOT EXISTS salvage_reason text NULL,
  ADD COLUMN IF NOT EXISTS repaired_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS salvaged_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS parser_validation_errors jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_kind_pass_ts
  ON public.analysis_judge_diagnostics (job_id, diagnostic_kind, pass_name, timestamp DESC);
