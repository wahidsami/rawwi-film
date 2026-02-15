-- Manual findings: created_by and manual_comment on analysis_findings.

ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_comment text;
