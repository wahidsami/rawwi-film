ALTER TABLE public.analysis_review_findings
ADD COLUMN IF NOT EXISTS include_in_report boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.analysis_review_findings.include_in_report IS
'Controls whether this reviewer-facing finding should be included in exported PDF/Word reports. The card remains visible in the interactive review UI.';
