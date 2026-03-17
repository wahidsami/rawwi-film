-- Page span per chunk for analysis progress UI (maps chunk offsets to document pages)

ALTER TABLE analysis_chunks
  ADD COLUMN IF NOT EXISTS page_number_min integer,
  ADD COLUMN IF NOT EXISTS page_number_max integer;

COMMENT ON COLUMN analysis_chunks.page_number_min IS 'First script page (1-based) overlapping chunk start_offset; null if no script_pages';
COMMENT ON COLUMN analysis_chunks.page_number_max IS 'Last script page overlapping chunk end_offset; null if no script_pages';
