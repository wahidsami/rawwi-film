-- 1. Fix the Frontend (Update Metadata)
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "Admin"}'::jsonb
WHERE id = '11111111-2222-3333-4444-555555555555';

-- 2. Fix the Backend (Add to user_roles)
INSERT INTO public.user_roles (user_id, role_id)
SELECT 
  '11111111-2222-3333-4444-555555555555'::uuid,
  id
FROM public.roles
WHERE key = 'Admin' AND NOT EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = '11111111-2222-3333-4444-555555555555'::uuid AND role_id = public.roles.id
);