-- Optional page number on findings for "Page X" in reports (when script has script_pages).
ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS page_number int NULL;

COMMENT ON COLUMN analysis_findings.page_number IS 'Script page (1-based) where this finding appears; set when version has script_pages. Used for report "Page X" and workspace "Go to page".';
