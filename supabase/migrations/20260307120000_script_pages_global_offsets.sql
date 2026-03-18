-- Persist global [start,end) span per page row (matches script_text.content join with \n\n).
ALTER TABLE script_pages
  ADD COLUMN IF NOT EXISTS start_offset_global integer,
  ADD COLUMN IF NOT EXISTS end_offset_global integer;

COMMENT ON COLUMN script_pages.start_offset_global IS 'Start index of this page content in script_text.content (canonical join).';
COMMENT ON COLUMN script_pages.end_offset_global IS 'End index (exclusive) of this page content in script_text.content.';
