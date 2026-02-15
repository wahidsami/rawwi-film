-- Migration: Add view_scripts permission
-- Description: Adds the view_scripts permission for accessing the Scripts management page

-- Add view_scripts permission
INSERT INTO permissions (key, name, created_at)
VALUES (
  'view_scripts',
  'View Scripts',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Assign view_scripts to all roles (everyone can view scripts)
-- This assumes standard roles: client, regulator, admin
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT 
  r.id,
  p.id,
  NOW()
FROM roles r
CROSS JOIN permissions p
WHERE p.key = 'view_scripts'
  AND r.name IN ('Client', 'Regulator', 'Admin', 'Super Admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Add comment
COMMENT ON COLUMN permissions.key IS 'Unique permission identifier. view_scripts allows access to the Scripts management page with filtering capabilities.';
