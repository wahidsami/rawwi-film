-- 1. Upgrade Metadata to Super Admin (Forces Frontend Access)
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "Super Admin"}'::jsonb
WHERE id = '11111111-2222-3333-4444-555555555555';

-- 2. Upgrade DB Role (Fixes Backend Access)
INSERT INTO public.user_roles (user_id, role_id)
SELECT 
  '11111111-2222-3333-4444-555555555555'::uuid,
  id
FROM public.roles
WHERE key IN ('Super Admin', 'super_admin')
ON CONFLICT (user_id, role_id) DO NOTHING;