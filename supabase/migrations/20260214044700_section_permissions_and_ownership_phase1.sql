-- Phase 1: Safe Schema Additions (Non-Breaking)
-- This migration adds fields for section-based permissions and data ownership
-- WITHOUT enabling RLS or breaking existing functionality

-- ============================================================================
-- Part 1: Add Data Ownership to Clients Table
-- ============================================================================

-- Add created_by column to track who created each client
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);

-- Ensure scripts.created_by index exists (already in schema, but safe to check)
CREATE INDEX IF NOT EXISTS idx_scripts_created_by ON scripts(created_by);

-- Backfill existing clients with first Super Admin user (or leave NULL)
-- This runs safely even if some clients already have created_by
UPDATE clients
SET created_by = (
  SELECT id FROM auth.users
  WHERE raw_user_meta_data->>'role' = 'Super Admin'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE created_by IS NULL;

-- ============================================================================
-- Part 2: Helper Functions for RLS (Preparation, Not Enabled Yet)
-- ============================================================================

-- Function to check if current user is admin (Super Admin or Admin)
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean AS $$
BEGIN
  -- Check if user has admin role OR has access_control section
  RETURN (
    SELECT (
      raw_user_meta_data->>'role' IN ('Super Admin', 'Admin')
      OR
      raw_user_meta_data->'allowedSections' ? 'access_control'
    )
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has a specific section access
CREATE OR REPLACE FUNCTION has_section_access(section_id text)
RETURNS boolean AS $$
BEGIN
  -- Super Admin always has access
  IF (SELECT raw_user_meta_data->>'role' = 'Super Admin' FROM auth.users WHERE id = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has this section in allowedSections
  RETURN (
    SELECT raw_user_meta_data->'allowedSections' ? section_id
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Part 3: Add Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN clients.created_by IS 'User who created this client. NULL for legacy data created before ownership tracking.';
COMMENT ON COLUMN scripts.created_by IS 'User who created/uploaded this script.';
COMMENT ON FUNCTION is_admin_user() IS 'Returns true if current user is Super Admin, Admin, or has access_control section.';
COMMENT ON FUNCTION has_section_access(text) IS 'Returns true if current user has access to the specified section.';

-- ============================================================================
-- IMPORTANT NOTE: RLS is NOT enabled in this migration
-- ============================================================================
-- This migration only adds the necessary columns and functions.
-- RLS policies will be added in a separate migration after frontend updates.
-- Current behavior is preserved - all authenticated users can access all data.
