CREATE TABLE IF NOT EXISTS public.analysis_runtime_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  router_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_adapter_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_scope_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  finding_mapper_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  persistence_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_builder_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_payload_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_divergence jsonb,
  trace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_html text
);

COMMENT ON TABLE public.analysis_runtime_traces IS 'Debug-only V3 runtime flight recorder. Stores the end-to-end analysis trace per job when diagnostics are enabled.';
COMMENT ON COLUMN public.analysis_runtime_traces.router_trace IS 'Router and knowledge-selection trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.provider_trace IS 'Provider and legal-review trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.runtime_adapter_trace IS 'Runtime adapter trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.reviewer_scope_trace IS 'Reviewer scope validation trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.finding_mapper_trace IS 'Finding mapper trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.persistence_trace IS 'Persistence trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.report_builder_trace IS 'Report builder trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.api_payload_trace IS 'API payload trace grouped by job.';
COMMENT ON COLUMN public.analysis_runtime_traces.first_divergence IS 'First detected divergence across the trace.';
COMMENT ON COLUMN public.analysis_runtime_traces.trace_json IS 'Full serialized runtime trace payload.';
COMMENT ON COLUMN public.analysis_runtime_traces.trace_html IS 'Rendered human-readable HTML trace.';

CREATE INDEX IF NOT EXISTS idx_analysis_runtime_traces_job_id
  ON public.analysis_runtime_traces (job_id, created_at DESC);

ALTER TABLE public.analysis_runtime_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analysis_runtime_traces_all ON public.analysis_runtime_traces;
CREATE POLICY analysis_runtime_traces_all ON public.analysis_runtime_traces FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.analysis_jobs j
      WHERE j.id = analysis_runtime_traces.job_id
        AND j.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.analysis_jobs j
      WHERE j.id = analysis_runtime_traces.job_id
        AND j.created_by = auth.uid()
    )
  );
