-- =============================================================================
-- Seed Super Admin (run in Supabase Dashboard → SQL Editor)
-- =============================================================================
-- Your app gets role from: user_roles → roles (key = 'super_admin').
-- Migrations 0011_rbac.sql and 0012_rbac_seed.sql must already be applied
-- (roles + permissions + user_roles exist, and role 'super_admin' exists).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- OPTION A: Assign super_admin to an EXISTING user (recommended)
-- -----------------------------------------------------------------------------
-- 1. In Supabase: Authentication → Users. Create a user (email + password) or
--    note the id of an existing user.
-- 2. Replace <<YOUR_USER_UUID>> below with that user's UUID (e.g. from the URL
--    or from: SELECT id, email FROM auth.users;).
-- 3. Run this block once.

/*
INSERT INTO public.user_roles (user_id, role_id)
SELECT '<<YOUR_USER_UUID>>'::uuid, r.id
FROM public.roles r
WHERE r.key = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;
*/

-- Example (replace with your real UUID):
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, r.id
-- FROM public.roles r
-- WHERE r.key = 'super_admin'
-- ON CONFLICT (user_id, role_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- OPTION B: Create a new super admin user directly in the DB (advanced)
-- -----------------------------------------------------------------------------
-- Use this only if you cannot use the Dashboard to create users.
-- Replace email, password, and optional user id. After first login, change the
-- password in Dashboard or via the app.
-- Requires: pgcrypto extension (Supabase has it).

/*
-- 1) Create auth user (pick a UUID or let it be random)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'superadmin@yourdomain.com',
  crypt('YourSecurePassword123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Super Admin"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
RETURNING id;

-- 2) Create identity (use the id returned from step 1)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<<USER_ID_FROM_STEP_1>>'::uuid,
  '<<USER_ID_FROM_STEP_1>>',
  '{"sub":"<<USER_ID_FROM_STEP_1>>","email":"superadmin@yourdomain.com"}'::jsonb,
  'email',
  now(),
  now(),
  now()
);

-- 3) Assign super_admin role
INSERT INTO public.user_roles (user_id, role_id)
SELECT '<<USER_ID_FROM_STEP_1>>'::uuid, r.id
FROM public.roles r
WHERE r.key = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;
*/


-- -----------------------------------------------------------------------------
-- Quick check: list users and their roles
-- -----------------------------------------------------------------------------
-- SELECT id, email, raw_user_meta_data->>'name' AS name FROM auth.users;
-- SELECT u.id, u.email, r.key AS role_key FROM auth.users u
--   LEFT JOIN public.user_roles ur ON ur.user_id = u.id
--   LEFT JOIN public.roles r ON r.id = ur.role_id;
