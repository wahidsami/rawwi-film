-- Persist which report (job) is used for highlights per user per script.
-- When user clicks Highlight we save job_id; on load we restore and apply highlights.
CREATE TABLE IF NOT EXISTS user_script_highlight (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, script_id)
);

CREATE INDEX IF NOT EXISTS idx_user_script_highlight_script_id ON user_script_highlight(script_id);

ALTER TABLE user_script_highlight ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_script_highlight_select_own ON user_script_highlight FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_script_highlight_insert_own ON user_script_highlight FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_script_highlight_update_own ON user_script_highlight FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY user_script_highlight_delete_own ON user_script_highlight FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_script_highlight IS 'Stores the analysis job (report) selected for highlights per user per script; restored on next visit.';
