-- Script pages: per-page content for PDF/Word so workspace can show page-based view.
-- script_text.content remains the concatenation of all pages (for analysis); script_pages is for display and offset→page mapping.

CREATE TABLE IF NOT EXISTS script_pages (
  version_id uuid NOT NULL REFERENCES script_versions(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  content text NOT NULL,
  content_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_script_pages_version_id ON script_pages(version_id);

COMMENT ON TABLE script_pages IS 'Per-page content for a script version; used for page-based workspace view and mapping finding offsets to page numbers. script_text.content = concatenation of script_pages.content with fixed separator.';
