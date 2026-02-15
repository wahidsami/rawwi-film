-- Schema v1: aligned to docs/frontend-models.md
-- RLS is OFF; add later.

-- ---------------------------------------------------------------------------
-- Helpers: updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. clients (companies)
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  representative_name text,
  representative_title text,
  mobile text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. scripts
-- ---------------------------------------------------------------------------
CREATE TABLE scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('film', 'series')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'in_review', 'analysis_running', 'review_required', 'approved', 'rejected'
  )),
  synopsis text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scripts_client_id ON scripts(client_id);
CREATE INDEX idx_scripts_status ON scripts(status);

CREATE TRIGGER scripts_updated_at
  BEFORE UPDATE ON scripts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. script_versions
-- ---------------------------------------------------------------------------
CREATE TABLE script_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version_number int NOT NULL DEFAULT 1,
  source_file_name text,
  source_file_path text,
  extracted_text text,
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN (
    'pending', 'extracting', 'done', 'failed'
  )),
  normalized_text_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, version_number)
);

CREATE INDEX idx_script_versions_script_id ON script_versions(script_id);

CREATE TRIGGER script_versions_updated_at
  BEFORE UPDATE ON script_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. tasks
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id),
  assigned_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_script_id ON tasks(script_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. findings
-- ---------------------------------------------------------------------------
CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  script_version_id uuid REFERENCES script_versions(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('ai', 'manual', 'lexicon')),
  article_id text NOT NULL,
  atom_id text,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence numeric,
  title_ar text NOT NULL,
  description_ar text NOT NULL,
  evidence_snippet text NOT NULL,
  start_offset_global int,
  end_offset_global int,
  start_line_chunk int,
  end_line_chunk int,
  location jsonb,
  status text NOT NULL DEFAULT 'violation' CHECK (status IN ('violation', 'accepted', 'hidden')),
  override jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_script_id ON findings(script_id);
CREATE INDEX idx_findings_script_version_id ON findings(script_version_id);
CREATE INDEX idx_findings_article_id ON findings(article_id);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_status ON findings(status);

CREATE TRIGGER findings_updated_at
  BEFORE UPDATE ON findings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. finding_override_events (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE finding_override_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('not_violation', 'hidden_from_owner', 'revert')),
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finding_override_events_finding_id ON finding_override_events(finding_id);

-- View: latest override event per finding
CREATE VIEW effective_finding_overrides AS
SELECT DISTINCT ON (finding_id)
  id,
  finding_id,
  event_type,
  reason,
  created_by,
  created_at
FROM finding_override_events
ORDER BY finding_id, created_at DESC;

-- ---------------------------------------------------------------------------
-- 7. reports
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  script_version_id uuid REFERENCES script_versions(id) ON DELETE SET NULL,
  job_id uuid,
  created_at timestamptz DEFAULT now(),
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_html text
);

CREATE INDEX idx_reports_script_id ON reports(script_id);
CREATE INDEX idx_reports_job_id ON reports(job_id);

-- ---------------------------------------------------------------------------
-- 8. slang_lexicon
-- ---------------------------------------------------------------------------
CREATE TABLE slang_lexicon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  normalized_term text NOT NULL UNIQUE,
  term_type text NOT NULL CHECK (term_type IN ('word', 'phrase', 'regex')),
  category text NOT NULL,
  severity_floor text NOT NULL CHECK (severity_floor IN ('low', 'medium', 'high', 'critical')),
  enforcement_mode text NOT NULL CHECK (enforcement_mode IN ('soft_signal', 'mandatory_finding')),
  gcam_article_id int NOT NULL,
  gcam_atom_id text,
  gcam_article_title_ar text,
  description text,
  example_usage text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slang_lexicon_is_active ON slang_lexicon(is_active);
CREATE INDEX idx_slang_lexicon_category ON slang_lexicon(category);
CREATE INDEX idx_slang_lexicon_enforcement_mode ON slang_lexicon(enforcement_mode);

CREATE TRIGGER slang_lexicon_updated_at
  BEFORE UPDATE ON slang_lexicon
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. slang_lexicon_history
-- ---------------------------------------------------------------------------
CREATE TABLE slang_lexicon_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_id uuid,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  change_reason text
);

CREATE INDEX idx_slang_lexicon_history_lexicon_id ON slang_lexicon_history(lexicon_id);

-- Trigger: on insert/update/delete of slang_lexicon, write a row to slang_lexicon_history
CREATE OR REPLACE FUNCTION slang_lexicon_history_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, new_data, changed_by, change_reason)
    VALUES (NEW.id, 'INSERT', to_jsonb(NEW), NEW.created_by, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, old_data, new_data, changed_by, change_reason)
    VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NULL, NULL);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, old_data)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER slang_lexicon_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON slang_lexicon
  FOR EACH ROW EXECUTE FUNCTION slang_lexicon_history_trigger_fn();
