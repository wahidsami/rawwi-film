ALTER TABLE script_pages
ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN script_pages.meta IS
'Per-page extraction/display metadata. Used for OCR provenance, quality flags, and future editorial annotations such as strike-through spans.';
