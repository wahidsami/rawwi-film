-- Phase 2: Persisted approved_count + last_reviewed metadata on analysis_reports.

ALTER TABLE analysis_reports
  ADD COLUMN IF NOT EXISTS approved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_reviewed_role text;
