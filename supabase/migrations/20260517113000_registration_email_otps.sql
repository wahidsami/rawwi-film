-- OTP verification records for beneficiary registration flow.
-- Used between step 1 and step 2 to verify the registration email.

CREATE TABLE IF NOT EXISTS public.registration_email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('company', 'individual')),
  otp_hash text NOT NULL,
  verification_token_hash text NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  verification_token_expires_at timestamptz NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_email_otps_email_created
  ON public.registration_email_otps (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_email_otps_expires
  ON public.registration_email_otps (expires_at);

