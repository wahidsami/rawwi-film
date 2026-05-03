-- Store the client's expected script rank/priority alongside the submission.

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS expected_rank text NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scripts_expected_rank_check'
      AND conrelid = 'public.scripts'::regclass
  ) THEN
    ALTER TABLE public.scripts
      ADD CONSTRAINT scripts_expected_rank_check
      CHECK (expected_rank IN ('low', 'medium', 'high'));
  END IF;
END $$;

UPDATE public.scripts
SET expected_rank = COALESCE(NULLIF(expected_rank, ''), 'medium')
WHERE expected_rank IS NULL OR expected_rank = '';
