-- Phase 1A: Script/ScriptVersion alignment, analysis_jobs/chunks/findings/reports, RLS, Storage
-- Frontend contract unchanged; backend pro pipeline (upload, extract, ingest).

-- ---------------------------------------------------------------------------
-- 1) scripts: align to Script model (add missing columns)
-- ---------------------------------------------------------------------------
ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS assignee_id text,
  ADD COLUMN IF NOT EXISTS current_version_id uuid REFERENCES script_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id text;

CREATE INDEX IF NOT EXISTS idx_scripts_current_version_id ON scripts(current_version_id);

-- ---------------------------------------------------------------------------
-- 2) script_versions: add extracted_text_hash, source_file_* for API
-- ---------------------------------------------------------------------------
ALTER TABLE script_versions
  ADD COLUMN IF NOT EXISTS source_file_type text,
  ADD COLUMN IF NOT EXISTS source_file_size int,
  ADD COLUMN IF NOT EXISTS source_file_url text,
  ADD COLUMN IF NOT EXISTS extracted_text_hash text;

-- ---------------------------------------------------------------------------
-- 3) analysis_jobs (Raawi-style)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress_total int NOT NULL DEFAULT 0,
  progress_done int NOT NULL DEFAULT 0,
  progress_percent int NOT NULL DEFAULT 0,
  normalized_text text,
  script_content_hash text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_jobs_script_id ON analysis_jobs(script_id);
CREATE INDEX idx_analysis_jobs_version_id ON analysis_jobs(version_id);
CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX idx_analysis_jobs_script_content_hash ON analysis_jobs(script_content_hash) WHERE script_content_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) analysis_chunks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  text text NOT NULL,
  start_offset int NOT NULL,
  end_offset int NOT NULL,
  start_line int NOT NULL,
  end_line int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'judging', 'done', 'failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);

CREATE INDEX idx_analysis_chunks_job_status ON analysis_chunks(job_id, status);

-- ---------------------------------------------------------------------------
-- 5) analysis_findings (Phase 1B will use; create now)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('ai', 'lexicon_mandatory', 'manual')),
  article_id int NOT NULL,
  atom_id text,
  severity text NOT NULL,
  confidence numeric,
  title_ar text NOT NULL,
  description_ar text NOT NULL,
  evidence_snippet text NOT NULL,
  start_offset_global int,
  end_offset_global int,
  start_line_chunk int,
  end_line_chunk int,
  location jsonb,
  evidence_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_findings_job_id ON analysis_findings(job_id);
CREATE UNIQUE INDEX idx_analysis_findings_job_evidence_hash ON analysis_findings(job_id, evidence_hash)
  WHERE evidence_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) analysis_reports (for later aggregation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_html text,
  findings_count int NOT NULL DEFAULT 0,
  severity_counts jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_reports_script_id ON analysis_reports(script_id);

-- ---------------------------------------------------------------------------
-- 7) RLS: scripts (ownership via created_by)
-- ---------------------------------------------------------------------------
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scripts_select_own ON scripts FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY scripts_insert_own ON scripts FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY scripts_update_own ON scripts FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY scripts_delete_own ON scripts FOR DELETE
  USING (created_by = auth.uid());

-- Allow read by assignee for assigned scripts (optional)
CREATE POLICY scripts_select_assignee ON scripts FOR SELECT
  USING (assignee_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 8) RLS: script_versions (via script ownership)
-- ---------------------------------------------------------------------------
ALTER TABLE script_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY script_versions_select ON script_versions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_versions.script_id AND (s.created_by = auth.uid() OR s.assignee_id = auth.uid()::text))
  );

CREATE POLICY script_versions_insert ON script_versions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_versions.script_id AND s.created_by = auth.uid())
  );

CREATE POLICY script_versions_update ON script_versions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_versions.script_id AND s.created_by = auth.uid())
  );

CREATE POLICY script_versions_delete ON script_versions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_versions.script_id AND s.created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 9) RLS: analysis_jobs, analysis_chunks, analysis_findings, analysis_reports
-- ---------------------------------------------------------------------------
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_jobs_all ON analysis_jobs FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

ALTER TABLE analysis_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_chunks_select ON analysis_chunks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_chunks.job_id AND j.created_by = auth.uid())
  );

CREATE POLICY analysis_chunks_insert ON analysis_chunks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_chunks.job_id AND j.created_by = auth.uid())
  );

CREATE POLICY analysis_chunks_update ON analysis_chunks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_chunks.job_id AND j.created_by = auth.uid())
  );

ALTER TABLE analysis_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_findings_all ON analysis_findings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_findings.job_id AND j.created_by = auth.uid())
  );

ALTER TABLE analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY analysis_reports_all ON analysis_reports FOR ALL
  USING (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM analysis_jobs j WHERE j.id = analysis_reports.job_id AND j.created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 10) Storage: bucket uploads, policy uploads/<auth.uid()>/...
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  52428800,
  ARRAY['text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS uploads_insert_own ON storage.objects;
DROP POLICY IF EXISTS uploads_select_own ON storage.objects;
DROP POLICY IF EXISTS uploads_update_own ON storage.objects;
DROP POLICY IF EXISTS uploads_delete_own ON storage.objects;

CREATE POLICY uploads_insert_own ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY uploads_select_own ON storage.objects FOR SELECT
  USING (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY uploads_update_own ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY uploads_delete_own ON storage.objects FOR DELETE
  USING (
    bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );
