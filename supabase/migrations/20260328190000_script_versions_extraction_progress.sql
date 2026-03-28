ALTER TABLE script_versions
  DROP CONSTRAINT IF EXISTS script_versions_extraction_status_check;

ALTER TABLE script_versions
  ADD COLUMN IF NOT EXISTS extraction_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_error text;

ALTER TABLE script_versions
  ADD CONSTRAINT script_versions_extraction_status_check
  CHECK (extraction_status IN ('pending', 'extracting', 'done', 'failed', 'cancelled'));
