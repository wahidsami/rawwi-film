-- Seed RBAC: admin role, all permissions referenced in frontend, assign permissions to admin.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
INSERT INTO roles (key, name) VALUES
  ('admin', 'Admin'),
  ('super_admin', 'Super Admin'),
  ('regulator', 'Regulator')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permissions (keys must match frontend: manage_users, manage_glossary, etc.)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, name) VALUES
  ('manage_users', 'Manage users & access control'),
  ('access_control:read', 'View access control'),
  ('access_control:manage', 'Manage access control'),
  ('manage_glossary', 'Manage glossary'),
  ('manage_companies', 'Manage companies'),
  ('assign_tasks', 'Assign tasks'),
  ('view_reports', 'View reports'),
  ('upload_scripts', 'Upload scripts'),
  ('run_analysis', 'Run analysis'),
  ('override_findings', 'Override findings'),
  ('generate_reports', 'Generate reports')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Admin role gets all permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'admin'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- Super Admin also gets all (same as admin for now)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'super_admin'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- Regulator: view_reports, manage_glossary only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('view_reports', 'manage_glossary')
WHERE r.key = 'regulator'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;
