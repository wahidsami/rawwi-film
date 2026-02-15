-- Audit trail: audit_events table + helper function
-- Use when 0001_init.sql does not include audit_events.

-- ---------------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_actor_user_id ON audit_events(actor_user_id);
CREATE INDEX idx_audit_events_entity_type ON audit_events(entity_type);
CREATE INDEX idx_audit_events_entity_id ON audit_events(entity_id);
CREATE INDEX idx_audit_events_action ON audit_events(action);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

COMMENT ON TABLE audit_events IS 'Append-only audit log for entity changes and actions';

-- ---------------------------------------------------------------------------
-- Helper: log_audit_event (simplifies inserts from SQL or RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_audit_event(
  p_actor_user_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_before_state jsonb DEFAULT NULL,
  p_after_state jsonb DEFAULT NULL,
  p_meta jsonb DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_events (
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_state,
    after_state,
    meta
  ) VALUES (
    p_actor_user_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_before_state,
    p_after_state,
    p_meta
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION log_audit_event IS 'Insert an audit event; returns the new event id. Use from Edge Functions via supabase.rpc(''log_audit_event'', {...}).';
