-- Migration: Add Approval/Rejection Permissions
-- Purpose: Create permissions for script approval workflow
-- Safe: Additive only, no existing data affected

-- ---------------------------------------------------------------------------
-- 1. Extend permissions table schema (if needed)
-- ---------------------------------------------------------------------------

-- Add name_ar if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'name_ar') THEN
    ALTER TABLE permissions ADD COLUMN name_ar TEXT;
  END IF;
END $$;

-- Add name_en if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'name_en') THEN
    ALTER TABLE permissions ADD COLUMN name_en TEXT;
  END IF;
END $$;

-- Add description if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'description') THEN
    ALTER TABLE permissions ADD COLUMN description TEXT;
  END IF;
END $$;

-- Add category if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'category') THEN
    ALTER TABLE permissions ADD COLUMN category TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add new permissions for approval workflow
-- ---------------------------------------------------------------------------

-- Insert approve_scripts permission
INSERT INTO permissions (key, name, name_ar, name_en, description, category, created_at)
VALUES (
  'approve_scripts',
  'Approve Scripts',
  'الموافقة على النصوص',
  'Approve Scripts',
  'Ability to approve scripts and change their status to approved',
  'scripts',
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Insert reject_scripts permission
INSERT INTO permissions (key, name, name_ar, name_en, description, category, created_at)
VALUES (
  'reject_scripts',
  'Reject Scripts',
  'رفض النصوص',
  'Reject Scripts',
  'Ability to reject scripts and change their status to rejected',
  'scripts',
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- Insert manage_script_status permission (for admins)
INSERT INTO permissions (key, name, name_ar, name_en, description, category, created_at)
VALUES (
  'manage_script_status',
  'Manage Script Status',
  'إدارة حالات النصوص',
  'Manage Script Status',
  'Full control over script status transitions (approve, reject, reset)',
  'scripts',
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- ---------------------------------------------------------------------------
-- Assign permissions to existing roles
-- ---------------------------------------------------------------------------

-- Get role IDs (safe: will fail silently if roles don't exist)
DO $$
DECLARE
  v_regulator_role_id UUID;
  v_admin_role_id UUID;
  v_approve_perm_id UUID;
  v_reject_perm_id UUID;
  v_manage_perm_id UUID;
BEGIN
  -- Find role IDs
  SELECT id INTO v_regulator_role_id FROM roles WHERE key = 'regulator' LIMIT 1;
  SELECT id INTO v_admin_role_id FROM roles WHERE key = 'admin' OR key = 'super_admin' LIMIT 1;
  
  -- Find permission IDs
  SELECT id INTO v_approve_perm_id FROM permissions WHERE key = 'approve_scripts' LIMIT 1;
  SELECT id INTO v_reject_perm_id FROM permissions WHERE key = 'reject_scripts' LIMIT 1;
  SELECT id INTO v_manage_perm_id FROM permissions WHERE key = 'manage_script_status' LIMIT 1;

  -- Assign approve & reject to Regulator role
  IF v_regulator_role_id IS NOT NULL AND v_approve_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, created_at)
    VALUES (v_regulator_role_id, v_approve_perm_id, NOW())
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_regulator_role_id IS NOT NULL AND v_reject_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, created_at)
    VALUES (v_regulator_role_id, v_reject_perm_id, NOW())
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- Assign full management to Admin role
  IF v_admin_role_id IS NOT NULL AND v_approve_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, created_at)
    VALUES (v_admin_role_id, v_approve_perm_id, NOW())
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_admin_role_id IS NOT NULL AND v_reject_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, created_at)
    VALUES (v_admin_role_id, v_reject_perm_id, NOW())
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  IF v_admin_role_id IS NOT NULL AND v_manage_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, created_at)
    VALUES (v_admin_role_id, v_manage_perm_id, NOW())
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

END $$;

-- ---------------------------------------------------------------------------
-- Comments for documentation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN permissions.category IS 
  'Logical grouping of permissions (e.g., scripts, clients, reports, system)';
