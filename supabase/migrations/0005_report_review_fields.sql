-- Add review fields to analysis_reports for approval workflow.

ALTER TABLE analysis_reports
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'under_review'
    CHECK (review_status IN ('under_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE INDEX IF NOT EXISTS idx_analysis_reports_review_status ON analysis_reports(review_status);
