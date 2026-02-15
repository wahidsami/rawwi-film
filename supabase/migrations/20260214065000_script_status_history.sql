-- Migration: Script Status History Table
-- Purpose: Track all script status transitions with full audit trail
-- Safe: Additive only, no breaking changes

-- ---------------------------------------------------------------------------
-- script_status_history table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS script_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  related_report_id UUID REFERENCES analysis_reports(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT valid_status_transition CHECK (
    from_status IN ('draft', 'in_review', 'analysis_running', 'review_required', 'approved', 'rejected') AND
    to_status IN ('draft', 'in_review', 'analysis_running', 'review_required', 'approved', 'rejected')
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_script_status_history_script 
  ON script_status_history(script_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_status_history_changed_by 
  ON script_status_history(changed_by);

CREATE INDEX IF NOT EXISTS idx_script_status_history_to_status 
  ON script_status_history(to_status, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_status_history_report 
  ON script_status_history(related_report_id) 
  WHERE related_report_id IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE script_status_history IS 
  'Immutable audit trail of all script status transitions. Used for compliance reporting and analytics.';

COMMENT ON COLUMN script_status_history.from_status IS 
  'Previous status value before transition';

COMMENT ON COLUMN script_status_history.to_status IS 
  'New status value after transition';

COMMENT ON COLUMN script_status_history.changed_by IS 
  'User who performed the status change';

COMMENT ON COLUMN script_status_history.reason IS 
  'Human-readable explanation for the change (especially important for rejections)';

COMMENT ON COLUMN script_status_history.related_report_id IS 
  'Optional link to analysis report that triggered this status change';

COMMENT ON COLUMN script_status_history.metadata IS 
  'Additional context (e.g., {"automated": true, "trigger": "clean_analysis"})';

-- Enable RLS (read-only for all authenticated users, write via service role only)
ALTER TABLE script_status_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view status history for scripts they own or are assigned to
CREATE POLICY script_status_history_select ON script_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scripts s
      WHERE s.id = script_status_history.script_id
        AND (s.created_by = auth.uid() OR s.assignee_id = auth.uid()::text)
    )
  );

-- Note: INSERT/UPDATE/DELETE are restricted to service role only (via Edge Functions)
-- This ensures status history is only modified through controlled API endpoints
