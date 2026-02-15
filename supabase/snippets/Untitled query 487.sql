SELECT 
  id, 
  email, 
  raw_user_meta_data->>'role' as metadata_role,
  (SELECT key FROM public.roles r 
   JOIN public.user_roles ur ON ur.role_id = r.id 
   WHERE ur.user_id = auth.users.id) as db_role
FROM auth.users
WHERE id = '11111111-2222-3333-4444-555555555555';