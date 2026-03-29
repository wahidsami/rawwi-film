ALTER TABLE analysis_jobs
  DROP CONSTRAINT IF EXISTS analysis_jobs_status_check;

ALTER TABLE analysis_jobs
  ADD CONSTRAINT analysis_jobs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'));
