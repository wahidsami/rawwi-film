-- Memory2 persistence layer:
-- 1) analysis_memory_units: staged memory artifacts used by analysis
-- 2) analysis_memory_traces: per-chunk traceability for injected memory context

CREATE TABLE IF NOT EXISTS public.analysis_memory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.script_versions(id) ON DELETE CASCADE,
  chunk_id uuid NULL REFERENCES public.analysis_chunks(id) ON DELETE CASCADE,
  chunk_index integer NULL,
  dedupe_key text NOT NULL,
  scope_level text NOT NULL CHECK (scope_level IN ('script', 'scene', 'chunk')),
  unit_type text NOT NULL,
  memory_version text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_offsets jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_units_job_chunk
  ON public.analysis_memory_units (job_id, chunk_id);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_units_script_version
  ON public.analysis_memory_units (script_id, version_id);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_units_scope_type
  ON public.analysis_memory_units (scope_level, unit_type);

CREATE TABLE IF NOT EXISTS public.analysis_memory_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.script_versions(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES public.analysis_chunks(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  pass_name text NOT NULL,
  memory_version text NOT NULL,
  trace_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_id, pass_name)
);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_traces_job_chunk
  ON public.analysis_memory_traces (job_id, chunk_id);

CREATE INDEX IF NOT EXISTS idx_analysis_memory_traces_script_version
  ON public.analysis_memory_traces (script_id, version_id);

