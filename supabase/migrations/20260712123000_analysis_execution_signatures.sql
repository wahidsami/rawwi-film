-- Immutable execution signature for completed analysis jobs.

CREATE TABLE IF NOT EXISTS public.analysis_execution_signatures (
  job_id uuid PRIMARY KEY REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  script_id uuid NOT NULL,
  version_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  provider_name text NOT NULL,
  model_name text NOT NULL,
  model_version text,
  router_model_name text,
  auditor_model_name text,
  rationale_model_name text,
  temperature numeric,
  top_p numeric,
  seed bigint,
  max_tokens integer,
  reasoning_effort text,
  response_format text,
  pipeline_version text,
  analysis_engine_version text,
  memory_version text,
  scene_memory_version text,
  script_memory_version text,
  evidence_pinning_version text,
  router_version text,
  grounding_version text,
  validator_version text,
  aggregation_version text,
  auditor_version text,
  violation_system_version text,
  system_prompt_hash text NOT NULL,
  user_prompt_hash text NOT NULL,
  combined_prompt_hash text NOT NULL,
  summary_hash text,
  memory_hash text,
  summary_source text,
  summary_generation_timestamp timestamptz,
  summary_model text,
  summary_version text,
  chunk_size integer,
  overlap_size integer,
  total_chunks integer,
  total_detection_passes integer,
  diagnostics_enabled boolean,
  lineage_enabled boolean,
  analysis_signature_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_execution_signatures_script_version
  ON public.analysis_execution_signatures (script_id, version_id);

COMMENT ON TABLE public.analysis_execution_signatures IS 'Immutable execution signatures for analysis jobs.';
COMMENT ON COLUMN public.analysis_execution_signatures.analysis_signature_hash IS 'Canonical SHA-256 fingerprint of the execution environment for the job.';
