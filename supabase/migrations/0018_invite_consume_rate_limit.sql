-- Minimal rate-limit tracking for invite consume (no auth) to prevent brute-force.
-- Edge function counts rows per IP in a time window and returns 429 if over limit.

CREATE TABLE IF NOT EXISTS invite_consume_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_consume_attempts_ip_time ON invite_consume_attempts(ip_address, attempted_at DESC);

-- RLS: only service_role can insert/select/delete (edge function).
ALTER TABLE invite_consume_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY invite_consume_attempts_all_service ON invite_consume_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE invite_consume_attempts IS 'Rate-limit tracking for POST /invites-consume; prune old rows periodically.';
