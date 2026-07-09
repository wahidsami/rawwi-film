ALTER TABLE public.analysis_judge_diagnostics
  ADD COLUMN IF NOT EXISTS validated_findings_json jsonb NULL;
