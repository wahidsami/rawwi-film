-- Saved reviewer action for each analysis review finding.

ALTER TABLE public.analysis_review_findings
  ADD COLUMN IF NOT EXISTS action_text text NULL;

COMMENT ON COLUMN public.analysis_review_findings.action_text IS
  'Optional reviewer action text shown in the report export table.';
