-- Migration: Enhanced Audit Events for Script Approval
-- Purpose: Add helper function for logging approval/rejection events
-- Safe: Additive only, extends existing audit_events table

-- ---------------------------------------------------------------------------
-- Helper function for logging script status changes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_script_status_change(
  p_script_id UUID,
  p_from_status TEXT,
  p_to_status TEXT,
  p_changed_by UUID,
  p_reason TEXT DEFAULT NULL,
  p_related_report_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_history_id UUID;
  v_audit_id UUID;
  v_script_title TEXT;
  v_event_type TEXT;
BEGIN
  -- Get script title for audit log
  SELECT title INTO v_script_title FROM scripts WHERE id = p_script_id LIMIT 1;
  
  -- Determine event type
  CASE 
    WHEN p_to_status = 'approved' THEN v_event_type := 'script_approved';
    WHEN p_to_status = 'rejected' THEN v_event_type := 'script_rejected';
    WHEN p_to_status = 'in_review' THEN v_event_type := 'script_submitted';
    ELSE v_event_type := 'script_status_changed';
  END CASE;

  -- Insert into script_status_history
  INSERT INTO script_status_history (
    script_id,
    from_status,
    to_status,
    changed_by,
    changed_at,
    reason,
    related_report_id,
    metadata
  ) VALUES (
    p_script_id,
    p_from_status,
    p_to_status,
    p_changed_by,
    NOW(),
    p_reason,
    p_related_report_id,
    p_metadata
  )
  RETURNING id INTO v_history_id;

  -- Insert into audit_events (using existing table structure)
  INSERT INTO audit_events (
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_state,
    after_state,
    meta
  ) VALUES (
    p_changed_by,
    'script',
    p_script_id,
    v_event_type,
    jsonb_build_object(
      'status', p_from_status,
      'title', v_script_title
    ),
    jsonb_build_object(
      'status', p_to_status,
      'title', v_script_title,
      'reason', p_reason,
      'related_report_id', p_related_report_id
    ),
    p_metadata || jsonb_build_object('history_id', v_history_id)
  )
  RETURNING id INTO v_audit_id;

  RETURN v_history_id;
END;
$$;

COMMENT ON FUNCTION log_script_status_change IS 
  'Atomically log script status change to both script_status_history and audit_events. 
   Returns the history record ID. Call from Edge Functions via supabase.rpc().';

-- ---------------------------------------------------------------------------
-- Helper function for checking approval permissions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION user_can_approve_scripts(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_approve BOOLEAN := FALSE;
BEGIN
  -- Check if user has approve_scripts or manage_script_status permission
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND p.key IN ('approve_scripts', 'manage_script_status')
  ) INTO v_can_approve;

  RETURN v_can_approve;
END;
$$;

COMMENT ON FUNCTION user_can_approve_scripts IS 
  'Check if user has permission to approve scripts. Use before allowing approval actions.';

CREATE OR REPLACE FUNCTION user_can_reject_scripts(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_reject BOOLEAN := FALSE;
BEGIN
  -- Check if user has reject_scripts or manage_script_status permission
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND p.key IN ('reject_scripts', 'manage_script_status')
  ) INTO v_can_reject;

  RETURN v_can_reject;
END;
$$;

COMMENT ON FUNCTION user_can_reject_scripts IS 
  'Check if user has permission to reject scripts. Use before allowing rejection actions.';
