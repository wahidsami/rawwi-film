-- Migration: Update is_admin_user() to include Regulator role
-- This ensures RLS policies match Edge Function permission logic

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean AS $$
BEGIN
  -- Check if user has admin role (Super Admin, Admin, or Regulator) OR has access_control section
  RETURN (
    SELECT (
      raw_user_meta_data->>'role' IN ('Super Admin', 'Admin', 'Regulator')
      OR
      raw_user_meta_data->'allowedSections' ? 'access_control'
    )
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION is_admin_user() IS 'Checks if current user has admin-level access (Super Admin, Admin, or Regulator roles). Used by RLS policies to grant elevated permissions.';
