-- Ensure clients table supports individual beneficiary registration fields.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS beneficiary_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS regulations_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS individual_full_name text,
  ADD COLUMN IF NOT EXISTS individual_date_of_birth date,
  ADD COLUMN IF NOT EXISTS individual_nationality text,
  ADD COLUMN IF NOT EXISTS individual_national_id_or_iqama text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_beneficiary_type_check'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_beneficiary_type_check
      CHECK (beneficiary_type IN ('company', 'individual'));
  END IF;
END $$;

UPDATE public.clients
SET beneficiary_type = 'company'
WHERE beneficiary_type IS NULL OR beneficiary_type = '';

