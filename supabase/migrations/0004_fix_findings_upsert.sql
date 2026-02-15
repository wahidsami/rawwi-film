-- Fix: ON CONFLICT (job_id, evidence_hash) requires a non-partial unique index.
-- The existing partial index (WHERE evidence_hash IS NOT NULL) cannot be used by
-- Postgres for ON CONFLICT resolution.
--
-- Solution: add a plain (non-partial) unique index on (job_id, evidence_hash).
-- Rows with NULL evidence_hash are always distinct per SQL NULL semantics, so this
-- is safe — NULLs never conflict with each other.

-- Keep the old partial index (it's still useful for queries); add the new one.
CREATE UNIQUE INDEX IF NOT EXISTS analysis_findings_job_evidence_hash_uniq
  ON public.analysis_findings (job_id, evidence_hash);
