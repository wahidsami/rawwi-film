-- Progress UI: coarse pipeline phase, parallel pass counts, text preview for active chunk

ALTER TABLE analysis_chunks
  ADD COLUMN IF NOT EXISTS processing_phase text,
  ADD COLUMN IF NOT EXISTS passes_completed smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passes_total smallint NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS text_preview text;

COMMENT ON COLUMN analysis_chunks.processing_phase IS 'Coarse stage: router, multipass, hybrid, aggregating, cached';
COMMENT ON COLUMN analysis_chunks.passes_completed IS 'Detectors finished (multi-pass runs in parallel)';
COMMENT ON COLUMN analysis_chunks.passes_total IS 'Total detection passes for this run';
COMMENT ON COLUMN analysis_chunks.text_preview IS 'Truncated chunk start for progress UI (~280 grapheme clusters max)';
