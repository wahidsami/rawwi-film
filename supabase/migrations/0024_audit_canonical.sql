-- Canonical audit event schema (TODO #3) + view_audit permission.
-- Adds columns to audit_events and seeds view_audit for admin/super_admin.

-- ---------------------------------------------------------------------------
-- 1. Add canonical columns to audit_events
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS target_label text,
  ADD COLUMN IF NOT EXISTS result_status text DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS result_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text;

COMMENT ON COLUMN audit_events.event_type IS 'Canonical event type: TASK_CREATED, FINDING_MARKED_SAFE, etc.';
COMMENT ON COLUMN audit_events.occurred_at IS 'When the event occurred (ISO timestamp + timezone).';
COMMENT ON COLUMN audit_events.target_type IS 'Entity type: script, task, report, glossary, client.';
COMMENT ON COLUMN audit_events.result_status IS 'success or failure.';

-- Backfill: map legacy columns to canonical where canonical is null
UPDATE audit_events
SET
  event_type = COALESCE(event_type, action),
  target_type = COALESCE(target_type, entity_type),
  target_id = COALESCE(target_id, entity_id::text),
  occurred_at = COALESCE(occurred_at, created_at),
  result_status = COALESCE(result_status, 'success')
WHERE event_type IS NULL OR occurred_at IS NULL;

-- Default occurred_at for new rows
ALTER TABLE audit_events
  ALTER COLUMN occurred_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_target_type ON audit_events(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_result_status ON audit_events(result_status);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Permission view_audit (admin-only view/export)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, name) VALUES
  ('view_audit', 'View audit log and export')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('admin', 'super_admin') AND p.key = 'view_audit'
ON CONFLICT ON CONSTRAINT role_permissions_pkey DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. RLS: only users with view_audit can read; inserts via service_role only
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select_policy ON audit_events;
CREATE POLICY audit_events_select_policy ON audit_events
  FOR SELECT TO authenticated
  USING (
    get_my_permissions() @> ARRAY['view_audit']::text[]
  );

-- Inserts/updates/deletes only by service role (Edge Functions use service key)
DROP POLICY IF EXISTS audit_events_insert_service ON audit_events;
CREATE POLICY audit_events_insert_service ON audit_events
  FOR INSERT TO service_role WITH CHECK (true);

-- No UPDATE/DELETE for audit (append-only). Omit or restrict to service_role purge if added later.
