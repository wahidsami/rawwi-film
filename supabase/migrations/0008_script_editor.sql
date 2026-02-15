-- Script Editor: store extracted full text and basic sections per version.
-- Used by GET /scripts/editor and editor UI.

-- ---------------------------------------------------------------------------
-- script_text: one row per version (normalized full content + hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_text (
  version_id uuid PRIMARY KEY REFERENCES script_versions(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- script_sections: sections within a version (headings or "Full Script")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  index int NOT NULL,
  title text NOT NULL,
  start_offset int NOT NULL,
  end_offset int NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_sections_version_id ON script_sections(version_id);
CREATE INDEX IF NOT EXISTS idx_script_sections_script_id ON script_sections(script_id);
