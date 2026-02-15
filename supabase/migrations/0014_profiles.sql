-- Profiles: display name and email for auth.users (optional sync; Auth is source of truth for email).
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile.
CREATE POLICY profiles_select_own ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role can do everything (edge function uses service role).
CREATE POLICY profiles_all_service ON profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE profiles IS 'Display name and email cache for auth.users; used by access-control and /me.';
