CREATE TABLE IF NOT EXISTS public.analysis_prompt_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES public.analysis_chunks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  chunk_text text NOT NULL,
  evidence_spans jsonb NOT NULL,
  candidate_reviewers jsonb NOT NULL,
  candidate_articles jsonb NOT NULL,
  candidate_atoms jsonb NOT NULL,
  compiled_reviewer_context text NOT NULL,
  system_prompt text NOT NULL,
  user_prompt text NOT NULL,
  raw_provider_response jsonb NOT NULL,
  parsed_decision jsonb NOT NULL,
  UNIQUE (job_id, chunk_id)
);

COMMENT ON TABLE public.analysis_prompt_replays IS 'Debug-only V3 full prompt replay capture. Stores the complete provider request/response payload per analyzed chunk when V3_DIAGNOSTIC_MODE is enabled.';
COMMENT ON COLUMN public.analysis_prompt_replays.chunk_text IS 'Original chunk text fed into the V3 runtime.';
COMMENT ON COLUMN public.analysis_prompt_replays.evidence_spans IS 'Structured evidence spans extracted for the provider call.';
COMMENT ON COLUMN public.analysis_prompt_replays.candidate_reviewers IS 'Candidate reviewer set passed into the prompt replay.';
COMMENT ON COLUMN public.analysis_prompt_replays.candidate_articles IS 'Candidate article set passed into the prompt replay.';
COMMENT ON COLUMN public.analysis_prompt_replays.candidate_atoms IS 'Candidate atom set passed into the prompt replay.';
COMMENT ON COLUMN public.analysis_prompt_replays.compiled_reviewer_context IS 'Serialized compiled reviewer context used to build the prompt.';
COMMENT ON COLUMN public.analysis_prompt_replays.system_prompt IS 'Final system prompt sent to the provider.';
COMMENT ON COLUMN public.analysis_prompt_replays.user_prompt IS 'Final user prompt sent to the provider.';
COMMENT ON COLUMN public.analysis_prompt_replays.raw_provider_response IS 'Raw provider response payload before validation.';
COMMENT ON COLUMN public.analysis_prompt_replays.parsed_decision IS 'Parsed provider decision payload after mapping.';

CREATE INDEX IF NOT EXISTS idx_analysis_prompt_replays_job_id
  ON public.analysis_prompt_replays (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_prompt_replays_chunk_id
  ON public.analysis_prompt_replays (chunk_id, created_at DESC);
