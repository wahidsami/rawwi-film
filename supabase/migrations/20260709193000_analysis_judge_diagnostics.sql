CREATE TABLE IF NOT EXISTS public.analysis_judge_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES public.analysis_chunks(id) ON DELETE CASCADE,
  prompt_hash text NOT NULL,
  router_candidates jsonb NULL,
  raw_judge_response text NOT NULL,
  parsed_judge_response jsonb NULL,
  parsed_finding_count integer NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_chunk
  ON public.analysis_judge_diagnostics (job_id, chunk_id);

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diagnostics_job_timestamp
  ON public.analysis_judge_diagnostics (job_id, timestamp DESC);
