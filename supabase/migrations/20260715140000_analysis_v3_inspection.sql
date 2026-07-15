CREATE TABLE IF NOT EXISTS public.analysis_v3_inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  chunk_id uuid NULL REFERENCES public.analysis_chunks(id) ON DELETE SET NULL,
  finding_key text NOT NULL,
  stage_name text NOT NULL,
  stage_order integer NOT NULL,
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analysis_v3_inspection IS 'Debug-only V3 flight recorder. Stores structured reasoning lifecycle payloads when V3_INSPECTION_MODE is enabled.';
COMMENT ON COLUMN public.analysis_v3_inspection.finding_key IS 'Stable lifecycle key for a finding across V3 stages.';
COMMENT ON COLUMN public.analysis_v3_inspection.stage_name IS 'Deterministic inspection stage label.';
COMMENT ON COLUMN public.analysis_v3_inspection.stage_order IS 'Ordered stage number from 1 to 8.';
COMMENT ON COLUMN public.analysis_v3_inspection.payload_json IS 'Structured JSON payload for the captured inspection stage.';

CREATE INDEX IF NOT EXISTS idx_analysis_v3_inspection_job_id
  ON public.analysis_v3_inspection (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_v3_inspection_chunk_id
  ON public.analysis_v3_inspection (chunk_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_v3_inspection_finding_key
  ON public.analysis_v3_inspection (finding_key, stage_order, created_at DESC);
