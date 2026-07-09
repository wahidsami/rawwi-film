-- Align scripts.expected_rank constraint with current beneficiary UX values.
-- Supports both legacy values and new rating values used in beneficiary dashboard.

ALTER TABLE public.scripts
  ALTER COLUMN expected_rank DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scripts_expected_rank_check'
      AND conrelid = 'public.scripts'::regclass
  ) THEN
    ALTER TABLE public.scripts DROP CONSTRAINT scripts_expected_rank_check;
  END IF;
END $$;

ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_expected_rank_check
  CHECK (
    expected_rank IS NULL
    OR expected_rank IN (
      'low', 'medium', 'high',
      'G', 'PG', 'PG12', 'PG15', 'R15', 'R18'
    )
  );

UPDATE public.scripts
SET expected_rank = CASE LOWER(TRIM(expected_rank))
  WHEN '' THEN NULL
  WHEN 'g' THEN 'G'
  WHEN 'pg' THEN 'PG'
  WHEN 'pg12' THEN 'PG12'
  WHEN 'pg15' THEN 'PG15'
  WHEN 'r15' THEN 'R15'
  WHEN 'r18' THEN 'R18'
  WHEN 'low' THEN 'low'
  WHEN 'medium' THEN 'medium'
  WHEN 'high' THEN 'high'
  ELSE NULL
END
WHERE expected_rank IS NOT NULL;

