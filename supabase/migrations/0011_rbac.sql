-- RBAC: roles, permissions, user_roles, role_permissions.
-- Frontend guards use permission keys (e.g. manage_users) from these tables.

-- Drop existing RBAC tables if they exist (e.g. wrong structure from another source).
-- Order: dependents first, then roles/permissions.
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roles_key ON roles(key);

-- ---------------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);

-- ---------------------------------------------------------------------------
-- user_roles (assigns auth.users to roles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ---------------------------------------------------------------------------
-- role_permissions (assigns permissions to roles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- ---------------------------------------------------------------------------
-- RLS: only service role / backend should modify; allow read for authenticated
-- Users may read their own role/permission assignments via a secure function.
-- ---------------------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Roles and permissions are readable by authenticated users (for UI).
CREATE POLICY roles_select ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_select ON permissions FOR SELECT TO authenticated USING (true);

-- user_roles: users can read their own row only.
CREATE POLICY user_roles_select_own ON user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- role_permissions: readable by authenticated (needed to resolve role -> permissions).
CREATE POLICY role_permissions_select ON role_permissions FOR SELECT TO authenticated USING (true);

-- All INSERT/UPDATE/DELETE restricted to service_role (backend/edge functions use service key).
CREATE POLICY roles_insert ON roles FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY roles_update ON roles FOR UPDATE TO service_role USING (true);
CREATE POLICY roles_delete ON roles FOR DELETE TO service_role USING (true);
CREATE POLICY permissions_insert ON permissions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY permissions_update ON permissions FOR UPDATE TO service_role USING (true);
CREATE POLICY permissions_delete ON permissions FOR DELETE TO service_role USING (true);
CREATE POLICY user_roles_insert ON user_roles FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY user_roles_update ON user_roles FOR UPDATE TO service_role USING (true);
CREATE POLICY user_roles_delete ON user_roles FOR DELETE TO service_role USING (true);
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE TO service_role USING (true);
CREATE POLICY role_permissions_delete ON role_permissions FOR DELETE TO service_role USING (true);

-- ---------------------------------------------------------------------------
-- Function: get permission keys for the current user (from user_roles -> role_permissions -> permissions)
-- Used by edge function /me and can be used by other backends.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::text[])
  FROM user_roles ur
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = auth.uid();
$$;

COMMENT ON FUNCTION get_my_permissions IS 'Returns permission keys for the current auth.uid(). Used by /me and frontend RBAC.';
