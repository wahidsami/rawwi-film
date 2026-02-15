-- Backfill: ensure rows with created_by set are labeled as manual (single source of truth).
-- Only run if you have legacy rows where source was not set to 'manual' for user-created findings.
UPDATE analysis_findings
SET source = 'manual'
WHERE created_by IS NOT NULL
  AND source IS DISTINCT FROM 'manual';

COMMENT ON COLUMN analysis_findings.source IS 'Single source of truth: ai | lexicon_mandatory | manual. UI must not infer from created_by or other fields.';
