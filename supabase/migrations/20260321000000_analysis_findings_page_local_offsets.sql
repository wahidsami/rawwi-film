-- Page-local offsets relative to script_pages.content for the page containing start_offset_global.

ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS start_offset_page int NULL,
  ADD COLUMN IF NOT EXISTS end_offset_page int NULL;

COMMENT ON COLUMN analysis_findings.start_offset_page IS 'Start offset within script_pages row (same page as page_number); optional; filled by worker.';
COMMENT ON COLUMN analysis_findings.end_offset_page IS 'End offset exclusive within that page content.';
