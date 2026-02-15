-- Optional HTML content for script_text (e.g. from DOCX import for formatted view).
-- Plain content remains canonical for analysis and offset-based highlighting.
ALTER TABLE script_text
  ADD COLUMN IF NOT EXISTS content_html text NULL;

COMMENT ON COLUMN script_text.content_html IS 'Optional HTML from DOCX (mammoth); used for formatted viewer only. Offsets refer to script_text.content.';
