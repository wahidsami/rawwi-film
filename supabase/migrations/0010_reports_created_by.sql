-- Report history metadata: who created the report (audit-ready).
-- status is already review_status (under_review/approved/rejected) from 0005.

ALTER TABLE analysis_reports
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN analysis_reports.created_by IS 'User who ran the analysis that produced this report (from analysis_jobs.created_by at creation).';

CREATE INDEX IF NOT EXISTS idx_analysis_reports_created_by ON analysis_reports(created_by);
