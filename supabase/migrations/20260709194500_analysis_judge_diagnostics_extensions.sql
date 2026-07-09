ALTER TABLE public.analysis_judge_diagnostics
  ADD COLUMN IF NOT EXISTS diagnostic_kind text NOT NULL DEFAULT 'judge_call',
  ADD COLUMN IF NOT EXISTS judge_response_hash text NULL,
  ADD COLUMN IF NOT EXISTS raw_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS grounded_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS validated_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS final_chunk_finding_count integer NULL,
  ADD COLUMN IF NOT EXISTS final_chunk_findings jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_kind_chunk
  ON public.analysis_judge_diagnostics (job_id, diagnostic_kind, chunk_id);

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_chunk_kind_ts
  ON public.analysis_judge_diagnostics (job_id, chunk_id, diagnostic_kind, timestamp DESC);
