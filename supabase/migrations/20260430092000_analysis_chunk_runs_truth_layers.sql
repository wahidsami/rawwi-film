-- Split chunk runs into advisory model output and validator-approved output.

ALTER TABLE public.analysis_chunk_runs
  ADD COLUMN IF NOT EXISTS raw_ai_findings jsonb NULL,
  ADD COLUMN IF NOT EXISTS validated_ai_findings jsonb NULL,
  ADD COLUMN IF NOT EXISTS truth_layer_meta jsonb NULL;

COMMENT ON COLUMN public.analysis_chunk_runs.raw_ai_findings IS
  'Advisory model output before the final truth gate.';

COMMENT ON COLUMN public.analysis_chunk_runs.validated_ai_findings IS
  'Validator-approved findings used by the report and cache.';

COMMENT ON COLUMN public.analysis_chunk_runs.truth_layer_meta IS
  'Lightweight metadata describing advisory vs validated analysis state.';
