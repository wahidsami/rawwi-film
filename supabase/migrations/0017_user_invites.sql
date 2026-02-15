-- User invites: single-use, expiring invite links. Admin creates invite; edge function sends email via Resend.
-- Inserts/updates only via service role (edge function). Authenticated users with manage_users can read.

CREATE TABLE user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  invited_by uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  auth_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_invites_token_hash_key UNIQUE (token_hash)
);

COMMENT ON TABLE user_invites IS 'Pending user invites; token is hashed, single-use, expires.';
COMMENT ON COLUMN user_invites.invited_by IS 'auth.uid() of the admin who created the invite.';
COMMENT ON COLUMN user_invites.token_hash IS 'Hash of the single-use token sent in the invite link.';
COMMENT ON COLUMN user_invites.auth_user_id IS 'Set when the invitee completes sign-up (Supabase auth user id).';

CREATE INDEX idx_user_invites_email ON user_invites(email);
CREATE INDEX idx_user_invites_expires_at ON user_invites(expires_at);
CREATE INDEX idx_user_invites_used_at ON user_invites(used_at) WHERE used_at IS NULL;

ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- SELECT: only users with manage_users (or access_control:manage) can read invites
CREATE POLICY user_invites_select_admin ON user_invites
  FOR SELECT TO authenticated
  USING (
    get_my_permissions() @> ARRAY['manage_users']::text[]
    OR get_my_permissions() @> ARRAY['access_control:manage']::text[]
  );

-- INSERT/UPDATE/DELETE: service role only (edge function uses service key)
CREATE POLICY user_invites_insert_service ON user_invites FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY user_invites_update_service ON user_invites FOR UPDATE TO service_role USING (true);
CREATE POLICY user_invites_delete_service ON user_invites FOR DELETE TO service_role USING (true);
