-- Migration: Make is_admin_user() use user_roles (single source of truth)
-- So admins seeded only via user_roles (e.g. seed_super_admin.sql) are
-- treated as admin by RLS and can see all scripts, reports, jobs, findings.
-- Aligns RLS with Edge functions (isUserAdmin in roleCheck.ts).

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    -- Source of truth: user_roles + roles (same as Edge isUserAdmin)
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.key IN ('super_admin', 'admin', 'regulator')
    )
    -- Fallback: auth metadata (for users created via invite that set role)
    OR COALESCE(
      (SELECT (raw_user_meta_data->>'role' IN ('Super Admin', 'Admin', 'Regulator')
               OR raw_user_meta_data->'allowedSections' ? 'access_control')
       FROM auth.users
       WHERE id = auth.uid()),
      false
    )
  );
END;
$$;

COMMENT ON FUNCTION is_admin_user() IS 'Returns true if current user is admin (Super Admin, Admin, or Regulator). Uses user_roles + roles as source of truth; falls back to auth.users.raw_user_meta_data for backwards compatibility.';
