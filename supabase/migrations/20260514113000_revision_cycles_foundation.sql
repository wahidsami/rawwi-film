-- Phase B foundation: revision-cycle workflow entities and script status extension.

-- 1) Extend scripts.status allowed values for revision loop.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scripts_status_check'
      AND conrelid = 'public.scripts'::regclass
  ) THEN
    ALTER TABLE public.scripts DROP CONSTRAINT scripts_status_check;
  END IF;
END $$;

ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_status_check
  CHECK (
    status IN (
      'draft',
      'in_review',
      'analysis_running',
      'review_required',
      'revision_requested',
      'resubmitted',
      'approved',
      'rejected',
      'canceled',
      'cancelled'
    )
  );

-- 2) Revision cycles (one row per admin send-back round).
CREATE TABLE IF NOT EXISTS public.script_revision_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,
  source_report_id uuid NULL REFERENCES public.analysis_reports(id) ON DELETE SET NULL,
  source_job_id uuid NULL REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now(),
  beneficiary_returned_version_id uuid NULL REFERENCES public.script_versions(id) ON DELETE SET NULL,
  returned_at timestamptz NULL,
  reanalyzed_job_id uuid NULL REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  reanalyzed_report_id uuid NULL REFERENCES public.analysis_reports(id) ON DELETE SET NULL,
  reanalyzed_at timestamptz NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'returned', 'reanalyzed', 'closed')),
  admin_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (script_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_src_script_id ON public.script_revision_cycles(script_id);
CREATE INDEX IF NOT EXISTS idx_src_status ON public.script_revision_cycles(status);
CREATE INDEX IF NOT EXISTS idx_src_sent_at ON public.script_revision_cycles(sent_at DESC);

DROP TRIGGER IF EXISTS script_revision_cycles_updated_at ON public.script_revision_cycles;
CREATE TRIGGER script_revision_cycles_updated_at
  BEFORE UPDATE ON public.script_revision_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Cycle event timeline.
CREATE TABLE IF NOT EXISTS public.script_revision_cycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.script_revision_cycles(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'sent_for_review',
      'beneficiary_resubmitted',
      'admin_reanalysis_started',
      'admin_reanalysis_completed',
      'approved',
      'rejected'
    )
  ),
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srce_cycle_id ON public.script_revision_cycle_events(cycle_id);
CREATE INDEX IF NOT EXISTS idx_srce_script_id ON public.script_revision_cycle_events(script_id);
CREATE INDEX IF NOT EXISTS idx_srce_event_type ON public.script_revision_cycle_events(event_type);
CREATE INDEX IF NOT EXISTS idx_srce_created_at ON public.script_revision_cycle_events(created_at DESC);

-- 4) Frozen snapshots of findings/report at send time.
CREATE TABLE IF NOT EXISTS public.script_revision_cycle_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.script_revision_cycles(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.analysis_reports(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  findings_total integer NOT NULL DEFAULT 0,
  findings_approved integer NOT NULL DEFAULT 0,
  findings_violation integer NOT NULL DEFAULT 0,
  severity_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  type_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srcs_cycle_id ON public.script_revision_cycle_snapshots(cycle_id);
CREATE INDEX IF NOT EXISTS idx_srcs_script_id ON public.script_revision_cycle_snapshots(script_id);
CREATE INDEX IF NOT EXISTS idx_srcs_report_id ON public.script_revision_cycle_snapshots(report_id);

-- 5) Comparison output store between cycles/reports.
CREATE TABLE IF NOT EXISTS public.script_revision_cycle_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.script_revision_cycles(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  old_report_id uuid NOT NULL REFERENCES public.analysis_reports(id) ON DELETE CASCADE,
  new_report_id uuid NOT NULL REFERENCES public.analysis_reports(id) ON DELETE CASCADE,
  comparison_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparison_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srcc_cycle_id ON public.script_revision_cycle_comparisons(cycle_id);
CREATE INDEX IF NOT EXISTS idx_srcc_script_id ON public.script_revision_cycle_comparisons(script_id);
CREATE INDEX IF NOT EXISTS idx_srcc_old_new ON public.script_revision_cycle_comparisons(old_report_id, new_report_id);

