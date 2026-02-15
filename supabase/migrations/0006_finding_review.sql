-- Finding-level review (approve as safe / revert to violation) + audit log.

-- 1) Add review columns to analysis_findings
ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'violation'
    CHECK (review_status IN ('violation', 'approved')),
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_role text;

CREATE INDEX IF NOT EXISTS idx_analysis_findings_review_status
  ON analysis_findings(job_id, review_status);

-- 2) Audit table for finding review history
CREATE TABLE IF NOT EXISTS finding_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES analysis_findings(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finding_reviews_finding_id ON finding_reviews(finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_reviews_job_id ON finding_reviews(job_id);
