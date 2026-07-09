ALTER TABLE public.analysis_judge_diagnostics
  ADD COLUMN IF NOT EXISTS pass_name text NULL,
  ADD COLUMN IF NOT EXISTS findings_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS finding_count integer NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_kind_pass_chunk
  ON public.analysis_judge_diagnostics (job_id, diagnostic_kind, pass_name, chunk_id);
