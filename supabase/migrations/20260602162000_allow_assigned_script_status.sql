-- Allow the assignment workflow to promote scripts into an explicit assigned state.

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
      'assigned',
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
