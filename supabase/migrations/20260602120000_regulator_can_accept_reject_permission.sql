-- Add per-user regulator decision permission.
-- Regulators only gain approve/reject powers when their auth metadata includes
-- `can_accept_reject` in the stored permissions array.

-- Backfill existing regulator accounts so legacy users keep their current ability
-- while the new UI defaults new regulator accounts to read-only.
DO $$
DECLARE
  v_regulator_role_id uuid;
BEGIN
  SELECT id INTO v_regulator_role_id FROM roles WHERE key = 'regulator' LIMIT 1;

  IF v_regulator_role_id IS NOT NULL THEN
    UPDATE auth.users au
    SET raw_user_meta_data = jsonb_set(
      COALESCE(au.raw_user_meta_data, '{}'::jsonb),
      '{permissions}',
      CASE
        WHEN COALESCE(au.raw_user_meta_data->'permissions', '[]'::jsonb) ? 'can_accept_reject'
          THEN COALESCE(au.raw_user_meta_data->'permissions', '[]'::jsonb)
        ELSE COALESCE(au.raw_user_meta_data->'permissions', '[]'::jsonb) || '["can_accept_reject"]'::jsonb
      END,
      true
    )
    WHERE au.id IN (
      SELECT ur.user_id
      FROM user_roles ur
      WHERE ur.role_id = v_regulator_role_id
    )
    AND NOT (COALESCE(au.raw_user_meta_data->'permissions', '[]'::jsonb) ? 'can_accept_reject');
  END IF;
END $$;

-- Keep permissions returned to users aligned with auth metadata.
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_permissions_cte AS (
    SELECT DISTINCT p.key AS permission_key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND r.key <> 'regulator'
  ),
  metadata_permissions_cte AS (
    SELECT DISTINCT jsonb_array_elements_text(
      COALESCE(
        (SELECT raw_user_meta_data->'permissions' FROM auth.users WHERE id = auth.uid()),
        '[]'::jsonb
      )
    ) AS permission_key
  )
  SELECT COALESCE(array_agg(DISTINCT permission_key), ARRAY[]::text[])
  FROM (
    SELECT permission_key FROM role_permissions_cte
    UNION
    SELECT permission_key FROM metadata_permissions_cte
  ) merged;
$$;

COMMENT ON FUNCTION get_my_permissions IS
  'Returns permission keys for the current auth.uid(), merging role-based permissions and metadata permissions.';

CREATE OR REPLACE FUNCTION user_can_approve_scripts(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permissions text[] := ARRAY[]::text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT perm), ARRAY[]::text[])
  INTO v_permissions
  FROM (
    SELECT p.key AS perm
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND r.key IN ('super_admin', 'admin')
    UNION
    SELECT jsonb_array_elements_text(
      COALESCE((SELECT raw_user_meta_data->'permissions' FROM auth.users WHERE id = p_user_id), '[]'::jsonb)
    ) AS perm
  ) perms;

  RETURN v_permissions && ARRAY['approve_scripts', 'manage_script_status', 'can_accept_reject']::text[];
END;
$$;

COMMENT ON FUNCTION user_can_approve_scripts IS
  'Checks whether a user can approve scripts, including explicit regulator overrides from auth metadata.';

CREATE OR REPLACE FUNCTION user_can_reject_scripts(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permissions text[] := ARRAY[]::text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT perm), ARRAY[]::text[])
  INTO v_permissions
  FROM (
    SELECT p.key AS perm
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = p_user_id
      AND r.key IN ('super_admin', 'admin')
    UNION
    SELECT jsonb_array_elements_text(
      COALESCE((SELECT raw_user_meta_data->'permissions' FROM auth.users WHERE id = p_user_id), '[]'::jsonb)
    ) AS perm
  ) perms;

  RETURN v_permissions && ARRAY['reject_scripts', 'manage_script_status', 'can_accept_reject']::text[];
END;
$$;

COMMENT ON FUNCTION user_can_reject_scripts IS
  'Checks whether a user can reject scripts, including explicit regulator overrides from auth metadata.';
