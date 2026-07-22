-- Ensure the reviewer findings upsert target can resolve a real unique arbiter.
-- The existing partial unique index on (report_id, canonical_finding_id)
-- does not satisfy ON CONFLICT inference for the Supabase upsert path used by
-- analysis_review_findings materialization.

CREATE UNIQUE INDEX IF NOT EXISTS idx_arf_report_canonical_unique_nonpartial
  ON public.analysis_review_findings(report_id, canonical_finding_id);
