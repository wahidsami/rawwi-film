-- Regulator recommendation workflow.
-- Stores advisory recommendations separately from final approve/reject decisions.

CREATE TABLE IF NOT EXISTS public.script_recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  report_id uuid NULL REFERENCES public.analysis_reports(id) ON DELETE SET NULL,
  recommended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('recommended_approval', 'recommended_rejection')),
  reason text NOT NULL CHECK (char_length(trim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_recommendation_events_script_id
  ON public.script_recommendation_events(script_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_recommendation_events_recommended_by
  ON public.script_recommendation_events(recommended_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_recommendation_events_report_id
  ON public.script_recommendation_events(report_id, created_at DESC);

COMMENT ON TABLE public.script_recommendation_events IS
  'Regulator advisory recommendations for a script. Final approval/rejection remains separate.';
