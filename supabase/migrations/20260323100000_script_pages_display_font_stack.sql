-- Optional CSS font-family stack inferred from PDF text runs at import (pdf.js fontName → web-safe stack).
ALTER TABLE script_pages
  ADD COLUMN IF NOT EXISTS display_font_stack text;

COMMENT ON COLUMN script_pages.display_font_stack IS
  'CSS font-family stack for workspace viewer, derived from dominant PDF font name at extract time; null = use app default (e.g. Cairo).';
