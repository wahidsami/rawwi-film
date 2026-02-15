-- Migration: Run SQL Migrations Instruction
-- IMPORTANT: Run these migrations in Supabase SQL Editor in this exact order

-- ========================================================================================
-- PHASE 1: FOUNDATION - DATABASE MIGRATIONS
-- Execute these 3 SQL files in Supabase SQL Editor (query pane)
-- ========================================================================================

-- Step 1: Create script_status_history table
-- File: 20260214065000_script_status_history.sql
-- This creates the audit trail table for all script status changes
-- Safe: Completely additive, no impact on existing data
-- Expected result: "Success. No rows returned"

-- Step 2: Add approval/rejection permissions
-- File: 20260214065500_approval_permissions.sql  
-- This adds approve_scripts, reject_scripts, and manage_script_status permissions
-- Also assigns permissions to Regulator and Admin roles
-- Safe: Only inserts new permissions, uses ON CONFLICT DO NOTHING
-- Expected result: "Success. No rows returned" or "3 rows affected"

-- Step 3: Create helper functions
-- File: 20260214070000_enhanced_audit_events.sql
-- This creates log_script_status_change(), user_can_approve_scripts(), user_can_reject_scripts()
-- Safe: Only adds new functions, no changes to existing data
-- Expected result: "Success. No rows returned"

-- ========================================================================================
-- VERIFICATION QUERIES
-- Run these after the migrations to verify success
-- ========================================================================================

-- Check script_status_history table exists
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'script_status_history';
-- Expected: 1 row showing table_name = 'script_status_history'

-- Check new permissions created
SELECT key, name_en 
FROM permissions 
WHERE key IN ('approve_scripts', 'reject_scripts', 'manage_script_status')
ORDER BY key;
-- Expected: 3 rows

-- Check helper functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('log_script_status_change', 'user_can_approve_scripts', 'user_can_reject_scripts');
-- Expected: 3 rows

-- ========================================================================================
-- ROLLBACK (if needed)
-- Only run if you need to undo the migrations
-- ========================================================================================

-- Rollback Step 3: Drop helper functions
-- DROP FUNCTION IF EXISTS log_script_status_change(UUID, TEXT, TEXT, UUID, TEXT, UUID, JSONB);
-- DROP FUNCTION IF EXISTS user_can_approve_scripts(UUID);
-- DROP FUNCTION IF EXISTS user_can_reject_scripts(UUID);

-- Rollback Step 2: Delete permissions (this will cascade to role_permissions)
-- DELETE FROM permissions WHERE key IN ('approve_scripts', 'reject_scripts', 'manage_script_status');

-- Rollback Step 1: Drop table (this will cascade to all related data)
-- DROP TABLE IF EXISTS script_status_history CASCADE;

-- ========================================================================================
-- NOTES
-- ========================================================================================
-- 1. All changes are ADDITIVE - no destructive changes to existing data
-- 2. RLS is enabled on script_status_history - only service role can write
-- 3. Permissions are automatically assigned to existing Regulator/Admin roles
-- 4. Status history is immutable once written (audit trail integrity)
-- 5. Backend Edge Function (scripts/index.ts) uses these new features
