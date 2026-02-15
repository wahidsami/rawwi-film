-- Phase 1: Add view-level permissions to enable granular access control
-- This migration is ADDITIVE ONLY - it won't break existing functionality

-- ---------------------------------------------------------------------------
-- Add new view-level permissions
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, name) VALUES
  ('view_clients', 'View clients and client details'),
  ('view_scripts', 'View scripts (read-only)'),
  ('view_findings', 'View analysis findings'),
  ('add_manual_findings', 'Add manual compliance findings'),
  ('view_tasks', 'View assigned tasks'),
  ('view_audit', 'View system audit log')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grant ALL permissions to super_admin role (including new ones)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'super_admin'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grant ALL permissions to admin role (including new ones)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'admin'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- ---------------------------------------------------------------------------
-- Update regulator role with appropriate view permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'view_clients',
  'view_scripts',
  'view_findings',
  'view_reports',
  'view_tasks',
  'manage_glossary'
)
WHERE r.key = 'regulator'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- ---------------------------------------------------------------------------
-- Safety verification: Ensure super_admin and admin have ALL permissions
-- ---------------------------------------------------------------------------
COMMENT ON TABLE permissions IS 'Available system permissions. Super Admin and Admin roles must have all permissions for system stability.';
