-- Seed one dev user for local development (run after migrations).
-- Email: admin@raawi.film  Password: raawi123
-- Requires pgcrypto (Supabase auth schema has it).

-- Single dev user with fixed id for role assignment
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
  '11111111-2222-3333-4444-555555555555'::uuid,
  'authenticated',
  'authenticated',
  'admin@raawi.film',
  crypt('raawi123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Dev Admin"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Identity so email login works (provider_id = user id for email provider)
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
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  '11111111-2222-3333-4444-555555555555'::uuid,
  '11111111-2222-3333-4444-555555555555',
  '{"sub":"11111111-2222-3333-4444-555555555555","email":"admin@raawi.film"}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Grant super_admin role so the user has all permissions
INSERT INTO user_roles (user_id, role_id)
SELECT '11111111-2222-3333-4444-555555555555'::uuid, r.id
FROM roles r
WHERE r.key = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;
