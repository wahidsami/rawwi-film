-- Migration: Add Admin bypass policies for analysis tables
-- Ensures Admins can view all jobs, findings, and reports via direct database queries

-- Drop old restrictive policies
DROP POLICY IF EXISTS analysis_jobs_all ON analysis_jobs;
DROP POLICY IF EXISTS analysis_findings_all ON analysis_findings;
DROP POLICY IF EXISTS analysis_reports_all ON analysis_reports;

-- ANALYSIS_JOBS POLICIES

-- Policy: Admins can view all analysis jobs
CREATE POLICY "Admins can view all analysis_jobs"
ON analysis_jobs FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Users can view their own analysis jobs
CREATE POLICY "Users can view own analysis_jobs"
ON analysis_jobs FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Policy: Admins can manage all analysis jobs
CREATE POLICY "Admins can manage all analysis_jobs"
ON analysis_jobs FOR ALL
TO authenticated
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy: Users can insert own analysis jobs
CREATE POLICY "Users can insert own analysis_jobs"
ON analysis_jobs FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Policy: Users can update own analysis jobs
CREATE POLICY "Users can update own analysis_jobs"
ON analysis_jobs FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Policy: Users can delete own analysis jobs
CREATE POLICY "Users can delete own analysis_jobs"
ON analysis_jobs FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- ANALYSIS_FINDINGS POLICIES

-- Policy: Admins can view all analysis findings
CREATE POLICY "Admins can view all analysis_findings"
ON analysis_findings FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Users can view findings from their own jobs
CREATE POLICY "Users can view own analysis_findings"
ON analysis_findings FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
);

-- Policy: Admins can manage all findings
CREATE POLICY "Admins can manage all analysis_findings"
ON analysis_findings FOR ALL
TO authenticated
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy: Users can insert findings for their own jobs
CREATE POLICY "Users can insert own analysis_findings"
ON analysis_findings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
);

-- Policy: Users can update findings from their own jobs
CREATE POLICY "Users can update own analysis_findings"
ON analysis_findings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
);

-- Policy: Users can delete findings from their own jobs
CREATE POLICY "Users can delete own analysis_findings"
ON analysis_findings FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
);

-- ANALYSIS_REPORTS POLICIES

-- Policy: Admins can view all analysis reports
CREATE POLICY "Admins can view all analysis_reports"
ON analysis_reports FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Users can view reports from their own jobs
CREATE POLICY "Users can view own analysis_reports"
ON analysis_reports FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
);

-- Policy: Admins can manage all reports
CREATE POLICY "Admins can manage all analysis_reports"
ON analysis_reports FOR ALL
TO authenticated
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy: Users can insert reports for their own jobs
CREATE POLICY "Users can insert own analysis_reports"
ON analysis_reports FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
);

-- Policy: Users can update reports from their own jobs
CREATE POLICY "Users can update own analysis_reports"
ON analysis_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
);

-- Policy: Users can delete reports from their own jobs
CREATE POLICY "Users can delete own analysis_reports"
ON analysis_reports FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
);

-- Add comments
COMMENT ON POLICY "Admins can view all analysis_jobs" ON analysis_jobs IS 'Admins (Super Admin, Admin, Regulator) can view all analysis jobs regardless of ownership';
COMMENT ON POLICY "Admins can view all analysis_findings" ON analysis_findings IS 'Admins (Super Admin, Admin, Regulator) can view all findings regardless of ownership';
COMMENT ON POLICY "Admins can view all analysis_reports" ON analysis_reports IS 'Admins (Super Admin, Admin, Regulator) can view all reports regardless of ownership';
