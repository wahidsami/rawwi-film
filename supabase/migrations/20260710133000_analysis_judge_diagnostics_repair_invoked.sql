ALTER TABLE public.analysis_judge_diagnostics
  ADD COLUMN IF NOT EXISTS repair_invoked boolean;

CREATE INDEX IF NOT EXISTS idx_analysis_judge_diag_job_repair_invoked
  ON public.analysis_judge_diagnostics(job_id, repair_invoked)
  WHERE diagnostic_kind = 'judge_call';
