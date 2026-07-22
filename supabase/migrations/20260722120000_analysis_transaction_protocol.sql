-- Analysis Transaction Protocol v1
-- Adds immutable generation tracking so current-analysis reports can be validated
-- against the exact job that created them.

ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS analysis_generation_id uuid;

COMMENT ON COLUMN public.analysis_jobs.analysis_generation_id IS
  'Immutable generation identifier for the analysis job. Current-analysis reports must match this value.';

ALTER TABLE public.analysis_reports
  ADD COLUMN IF NOT EXISTS analysis_generation_id uuid,
  ADD COLUMN IF NOT EXISTS report_generation_id uuid;

COMMENT ON COLUMN public.analysis_reports.analysis_generation_id IS
  'Generation identifier copied from the analysis job that created the report.';

COMMENT ON COLUMN public.analysis_reports.report_generation_id IS
  'Generation identifier used by the report publish gate. Must match analysis_generation_id for the current analysis.';

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_analysis_generation_id
  ON public.analysis_jobs (analysis_generation_id);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_analysis_generation_id
  ON public.analysis_reports (analysis_generation_id);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_report_generation_id
  ON public.analysis_reports (report_generation_id);
