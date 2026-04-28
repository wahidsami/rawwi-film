-- Client certificate + fake payment foundation
-- Safe additive migration. Does not alter existing workspace/review flow.

CREATE TABLE IF NOT EXISTS public.script_certificate_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  payer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_base numeric(10,2) NOT NULL DEFAULT 3500.00,
  tax_amount numeric(10,2) NOT NULL DEFAULT 525.00,
  total_amount numeric(10,2) NOT NULL DEFAULT 4025.00,
  currency text NOT NULL DEFAULT 'SAR',
  payment_status text NOT NULL DEFAULT 'completed'
    CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method text NOT NULL DEFAULT 'fake_card',
  payment_reference text UNIQUE,
  demo_card_id text,
  card_brand text,
  card_last4 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL UNIQUE REFERENCES public.scripts(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.script_certificate_payments(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  certificate_number text NOT NULL UNIQUE,
  certificate_status text NOT NULL DEFAULT 'issued'
    CHECK (certificate_status IN ('issued', 'revoked')),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  certificate_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_certificate_payments_script_id
  ON public.script_certificate_payments(script_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_certificate_payments_status
  ON public.script_certificate_payments(payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_certificates_owner_user_id
  ON public.script_certificates(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_script_certificates_issued_at
  ON public.script_certificates(issued_at DESC);

DROP TRIGGER IF EXISTS script_certificate_payments_updated_at ON public.script_certificate_payments;
CREATE TRIGGER script_certificate_payments_updated_at
  BEFORE UPDATE ON public.script_certificate_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS script_certificates_updated_at ON public.script_certificates;
CREATE TRIGGER script_certificates_updated_at
  BEFORE UPDATE ON public.script_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_script_certificate_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  year_part text := to_char(now(), 'YYYY');
  next_seq integer;
BEGIN
  SELECT COALESCE(MAX(CAST(right(certificate_number, 5) AS integer)), 0) + 1
    INTO next_seq
  FROM public.script_certificates
  WHERE certificate_number LIKE ('RWF-' || year_part || '-%');

  RETURN 'RWF-' || year_part || '-' || lpad(next_seq::text, 5, '0');
END;
$$;

ALTER TABLE public.script_certificate_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own script certificate payments" ON public.script_certificate_payments;
CREATE POLICY "Users can view own script certificate payments"
ON public.script_certificate_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scripts s
    JOIN public.client_portal_accounts cpa
      ON (s.company_id = cpa.company_id::text OR s.client_id = cpa.company_id)
    WHERE s.id = script_certificate_payments.script_id
      AND cpa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can view own script certificates" ON public.script_certificates;
CREATE POLICY "Users can view own script certificates"
ON public.script_certificates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scripts s
    JOIN public.client_portal_accounts cpa
      ON (s.company_id = cpa.company_id::text OR s.client_id = cpa.company_id)
    WHERE s.id = script_certificates.script_id
      AND cpa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can view all script certificate payments" ON public.script_certificate_payments;
CREATE POLICY "Admins can view all script certificate payments"
ON public.script_certificate_payments
FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all script certificates" ON public.script_certificates;
CREATE POLICY "Admins can view all script certificates"
ON public.script_certificates
FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "Service role can manage script certificate payments" ON public.script_certificate_payments;
CREATE POLICY "Service role can manage script certificate payments"
ON public.script_certificate_payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage script certificates" ON public.script_certificates;
CREATE POLICY "Service role can manage script certificates"
ON public.script_certificates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.script_certificate_payments IS
'Demo/test payment records for client certificate issuance. Real gateway integration can replace this later.';

COMMENT ON TABLE public.script_certificates IS
'Issued script approval certificates linked to approved scripts and completed certificate payments.';
