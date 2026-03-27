-- Add pause/resume control fields for long-running analysis jobs.
ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS pause_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_pause_requested
  ON analysis_jobs(pause_requested)
  WHERE pause_requested = true;

COMMENT ON COLUMN analysis_jobs.pause_requested IS 'When true, worker must stop claiming new chunks for this job until resumed.';
COMMENT ON COLUMN analysis_jobs.paused_at IS 'Timestamp when pause was requested; cleared on resume.';
