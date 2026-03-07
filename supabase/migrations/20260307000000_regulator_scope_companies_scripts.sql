-- Regulator scope: only companies with assigned scripts, only scripts assigned to them.
-- Super Admin and Admin see everything; Regulator sees only assigned.
-- Requires: user_roles + roles (keys: super_admin, admin, regulator).

-- ---------------------------------------------------------------------------
-- 1. Helpers: is_super_admin_or_admin() and is_regulator()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin_or_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.key IN ('super_admin', 'admin')
  );
END;
$$;

COMMENT ON FUNCTION is_super_admin_or_admin() IS 'True only for Super Admin and Admin (not Regulator). Use for "see all" policies.';

CREATE OR REPLACE FUNCTION is_regulator()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.key = 'regulator'
  );
END;
$$;

COMMENT ON FUNCTION is_regulator() IS 'True if current user has Regulator role (may also have other roles).';

-- ---------------------------------------------------------------------------
-- 2. CLIENTS: Admins see all; Regulators see only clients with assigned scripts
-- ---------------------------------------------------------------------------
-- Drop old "Admins can view all" and recreate with is_super_admin_or_admin
DROP POLICY IF EXISTS "Admins can view all clients" ON clients;
CREATE POLICY "Admins can view all clients"
ON clients FOR SELECT
TO authenticated
USING (is_super_admin_or_admin());

-- Regulators see only clients that have at least one script assigned to them
CREATE POLICY "Regulators can view clients with assigned scripts"
ON clients FOR SELECT
TO authenticated
USING (
  is_regulator()
  AND EXISTS (
    SELECT 1 FROM scripts s
    WHERE (s.client_id = clients.id OR (s.company_id IS NOT NULL AND s.company_id = clients.id::text))
      AND s.assignee_id::text = auth.uid()::text
  )
);

-- Drop old "Admins can manage all" and recreate with is_super_admin_or_admin
DROP POLICY IF EXISTS "Admins can manage all clients" ON clients;
CREATE POLICY "Admins can manage all clients"
ON clients FOR ALL
TO authenticated
USING (is_super_admin_or_admin())
WITH CHECK (is_super_admin_or_admin());

-- ---------------------------------------------------------------------------
-- 3. SCRIPTS: Admins see all; Regulators see only scripts assigned to them
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all scripts" ON scripts;
CREATE POLICY "Admins can view all scripts"
ON scripts FOR SELECT
TO authenticated
USING (is_super_admin_or_admin());

-- Regulators see only scripts where they are the assignee
CREATE POLICY "Regulators can view assigned scripts"
ON scripts FOR SELECT
TO authenticated
USING (
  is_regulator()
  AND assignee_id::text = auth.uid()::text
);

-- Non-regulator users: view own or assigned scripts (regulators use policy above only)
DROP POLICY IF EXISTS "Users can view own or assigned scripts" ON scripts;
CREATE POLICY "Users can view own or assigned scripts"
ON scripts FOR SELECT
TO authenticated
USING (
  NOT is_regulator()
  AND (
    created_by::text = auth.uid()::text
    OR assignee_id::text = auth.uid()::text
  )
);

-- Admins manage all
DROP POLICY IF EXISTS "Admins can manage all scripts" ON scripts;
CREATE POLICY "Admins can manage all scripts"
ON scripts FOR ALL
TO authenticated
USING (is_super_admin_or_admin())
WITH CHECK (is_super_admin_or_admin());

-- Script INSERT: Regulators cannot insert. Only super_admin/admin or non-regulator (created_by = self).
DROP POLICY IF EXISTS "Users can insert own scripts" ON scripts;
CREATE POLICY "Users can insert own scripts"
ON scripts FOR INSERT
TO authenticated
WITH CHECK (
  created_by::text = auth.uid()::text
  AND NOT is_regulator()
);

-- Allow super_admin/admin to insert any (handled by "Admins can manage all scripts" which includes INSERT via FOR ALL)
-- So we need an explicit "Admins can insert scripts" for INSERT, because FOR ALL might not apply to INSERT in all PG versions.
-- Actually in Postgres, FOR ALL = SELECT, INSERT, UPDATE, DELETE. So "Admins can manage all scripts" already allows admins to insert.
-- So the only insert policy for non-admins is "Users can insert own scripts" with NOT is_regulator(). Good.
-- We need to allow admins to insert with any created_by. The policy "Admins can manage all scripts" with FOR ALL does include INSERT.
-- So for INSERT we have: (1) Admins can manage all -> WITH CHECK (is_super_admin_or_admin()) for INSERT. (2) Users can insert own scripts -> WITH CHECK (created_by = auth.uid() AND NOT is_regulator()).
-- In RLS, multiple policies are OR'd for the same command. So either (1) or (2) allows the insert. Good.
-- But wait - "Admins can manage all scripts" is FOR ALL. In PostgreSQL, FOR ALL creates separate policies for SELECT, INSERT, UPDATE, DELETE. So admins get INSERT allowed by that policy. And non-regulator users get INSERT by "Users can insert own scripts". Regulators don't match either (they don't pass NOT is_regulator() for the second, and they're not is_super_admin_or_admin() for the first). So we're good.
-- Double-check: Regulator inserts. First policy: USING/WITH CHECK is_super_admin_or_admin() -> false. Second: WITH CHECK created_by = auth.uid() AND NOT is_regulator() -> NOT is_regulator() is false. So no policy allows. Good.
-- Done.