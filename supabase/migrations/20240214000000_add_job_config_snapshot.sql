-- Migration: Add config_snapshot to analysis_jobs
-- Description: Stores the exact configuration used for the analysis job (models, temperature, seed, etc.) to ensure auditability and reproducibility.

ALTER TABLE analysis_jobs
ADD COLUMN IF NOT EXISTS config_snapshot jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN analysis_jobs.config_snapshot IS 'Snapshot of analysis configuration (models, params) at job creation time.';
