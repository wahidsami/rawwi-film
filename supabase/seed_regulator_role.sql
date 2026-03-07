-- =============================================================================
-- Assign Regulator role to a user (run in Supabase Dashboard → SQL Editor)
-- =============================================================================
-- Replace 'waheed3@example.com' with the regulator's email, then run.

-- Option 1: Assign regulator role by user EMAIL (easiest)
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
CROSS JOIN public.roles r
WHERE r.key = 'regulator'
  AND u.email = 'waheed3@example.com'   -- ← change this to your regulator's email
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Option 2: If you already know the user's UUID, use this instead:
-- INSERT INTO public.user_roles (user_id, role_id)
-- SELECT 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid, r.id
-- FROM public.roles r
-- WHERE r.key = 'regulator'
-- ON CONFLICT (user_id, role_id) DO NOTHING;

-- To list users and their IDs (to find the UUID):
-- SELECT id, email FROM auth.users;
