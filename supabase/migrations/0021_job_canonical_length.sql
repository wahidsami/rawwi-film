-- Tie analysis jobs to exact canonical text: optional length for quick mismatch check.
-- script_content_hash already exists on analysis_jobs (sha256 of script_text.content used for chunking).
ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS canonical_length int NULL;

COMMENT ON COLUMN analysis_jobs.script_content_hash IS 'SHA-256 of the exact canonical text (script_text.content) used for chunking and finding offsets. Viewer must use same text (same hash) to highlight.';
COMMENT ON COLUMN analysis_jobs.canonical_length IS 'Length of canonical text at analysis time; quick check alongside script_content_hash.';
