-- Client portal foundation:
-- - Adds `client` RBAC role for production-company users.
-- - Adds mapping table between auth user and their company account.
-- - Keeps registration/subscription free by default.

INSERT INTO public.roles (key, name)
VALUES ('client', 'Client')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.client_portal_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_plan text NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free')),
  subscription_status text NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_accounts_company_id
  ON public.client_portal_accounts(company_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_portal_accounts'
      AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS client_portal_accounts_updated_at ON public.client_portal_accounts;
    CREATE TRIGGER client_portal_accounts_updated_at
      BEFORE UPDATE ON public.client_portal_accounts
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.client_portal_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own client portal account" ON public.client_portal_accounts;
CREATE POLICY "Users can read own client portal account"
ON public.client_portal_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage client portal accounts" ON public.client_portal_accounts;
CREATE POLICY "Service role can manage client portal accounts"
ON public.client_portal_accounts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
