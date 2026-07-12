-- Deterministic script summary cache for Memory2.
-- One row per immutable script version.

CREATE TABLE IF NOT EXISTS public.analysis_script_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.script_versions(id) ON DELETE CASCADE,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_hash text NOT NULL,
  summary_generation_timestamp timestamptz NOT NULL DEFAULT now(),
  summary_model text NOT NULL,
  summary_version text NOT NULL,
  UNIQUE (script_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_script_summaries_script_version
  ON public.analysis_script_summaries (script_id, version_id);
