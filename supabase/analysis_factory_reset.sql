-- analysis_factory_reset.sql
-- Safe "Analysis Factory Reset" for the current Supabase database.
--
-- Goals:
-- - Preserve auth, storage, users, profiles, companies, settings, permissions,
--   roles, policy tables, GCAM tables, lexicon, reviewer academy, and all
--   configuration.
-- - Delete only operational analysis data that actually exists in the schema.
-- - Skip missing tables gracefully.
-- - Print row counts before and after each delete.
-- - Reset identity/sequence counters where appropriate.
-- - Remain idempotent and avoid schema changes.

-- ---------------------------------------------------------------------------
-- 0) Environment banner
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=== Analysis Factory Reset ===';
  RAISE NOTICE 'Database: %', current_database();
  RAISE NOTICE 'Schema: %', current_schema();
  RAISE NOTICE 'PostgreSQL: %', version();
  RAISE NOTICE 'Timestamp: %', clock_timestamp();
END $$;

-- ---------------------------------------------------------------------------
-- 1) Operational analysis data cleanup
-- ---------------------------------------------------------------------------
-- Deletion order is child-first to satisfy foreign keys.
-- Tables are only deleted if they exist in the current database.
DO $$
DECLARE
  tbl_name text;
  tbl_regclass regclass;
  before_count bigint;
  after_count bigint;
  deleted_tables integer := 0;
  deleted_rows bigint := 0;
  candidate_tables text[] := ARRAY[
    -- Reviewer/debug lineage and mapping traces
    'public.analysis_review_finding_sources',
    'public.analysis_review_findings',
    'public.analysis_finding_policy_links',
    'public.analysis_finding_lineage_events',

    -- V3 diagnostic / flight-recorder tables
    'public.analysis_v3_inspection',
    'public.analysis_prompt_replays',
    'public.analysis_runtime_traces',
    'public.analysis_judge_diagnostics',
    'public.analysis_investigations',

    -- Memory / evaluation / execution telemetry
    'public.analysis_memory_traces',
    'public.analysis_memory_units',
    'public.analysis_engine_evaluations',
    'public.analysis_execution_signatures',
    'public.analysis_script_summary_locks',
    'public.analysis_script_summaries',
    'public.analysis_chunk_runs',

    -- Core analysis outputs
    'public.analysis_reports',
    'public.analysis_findings',
    'public.analysis_chunks',
    'public.analysis_jobs'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY candidate_tables LOOP
    tbl_regclass := to_regclass(tbl_name);
    IF tbl_regclass IS NULL THEN
      RAISE NOTICE 'SKIP missing table: %', tbl_name;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO before_count;
    RAISE NOTICE 'BEFORE % = % rows', tbl_name, before_count;

    BEGIN
      EXECUTE format('DELETE FROM %s', tbl_regclass);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'DELETE FAILED for %: %', tbl_name, SQLERRM;
      CONTINUE;
    END;

    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO after_count;
    RAISE NOTICE 'AFTER  % = % rows', tbl_name, after_count;

    deleted_tables := deleted_tables + 1;
    deleted_rows := deleted_rows + GREATEST(before_count - after_count, 0);
  END LOOP;

  RAISE NOTICE 'Tables cleared: %', deleted_tables;
  RAISE NOTICE 'Rows deleted: %', deleted_rows;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Reset sequence / identity counters where appropriate
-- ---------------------------------------------------------------------------
-- Only tables with identity / sequence-backed primary keys need a reset.
-- UUID tables are intentionally skipped.
DO $$
DECLARE
  seq_name text;
  max_id bigint;
  tbl_name text;
  tbl_regclass regclass;
  sequence_targets text[] := ARRAY[
    'public.analysis_finding_lineage_events',
    'public.analysis_investigations'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY sequence_targets LOOP
    tbl_regclass := to_regclass(tbl_name);
    IF tbl_regclass IS NULL THEN
      RAISE NOTICE 'SKIP sequence reset for missing table: %', tbl_name;
      CONTINUE;
    END IF;

    seq_name := pg_get_serial_sequence(tbl_name, 'id');
    IF seq_name IS NULL THEN
      RAISE NOTICE 'SKIP sequence reset for % (no id sequence found)', tbl_name;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %s', tbl_regclass) INTO max_id;

    IF max_id = 0 THEN
      EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
      RAISE NOTICE 'RESET sequence % for % to next value 1', seq_name, tbl_name;
    ELSE
      EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_id);
      RAISE NOTICE 'RESET sequence % for % to max id %', seq_name, tbl_name, max_id;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Verification: core analysis tables should now be empty
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl_name text;
  tbl_regclass regclass;
  remaining_count bigint;
  verification_tables text[] := ARRAY[
    'public.analysis_jobs',
    'public.analysis_chunks',
    'public.analysis_findings',
    'public.analysis_reports',
    'public.analysis_review_findings',
    'public.analysis_review_finding_sources',
    'public.analysis_finding_policy_links',
    'public.analysis_finding_lineage_events',
    'public.analysis_v3_inspection',
    'public.analysis_prompt_replays',
    'public.analysis_runtime_traces',
    'public.analysis_judge_diagnostics',
    'public.analysis_investigations',
    'public.analysis_memory_traces',
    'public.analysis_memory_units',
    'public.analysis_engine_evaluations',
    'public.analysis_execution_signatures',
    'public.analysis_script_summary_locks',
    'public.analysis_script_summaries',
    'public.analysis_chunk_runs'
  ];
BEGIN
  RAISE NOTICE '--- Verification: analysis tables ---';
  FOREACH tbl_name IN ARRAY verification_tables LOOP
    tbl_regclass := to_regclass(tbl_name);
    IF tbl_regclass IS NULL THEN
      RAISE NOTICE 'VERIFY skip missing table: %', tbl_name;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO remaining_count;
    RAISE NOTICE 'VERIFY % remaining rows = %', tbl_name, remaining_count;
  END LOOP;

  RAISE NOTICE '--- Verification: preserved configuration tables are untouched ---';
  RAISE NOTICE 'No DELETE/ALTER/TRUNCATE statements were issued for auth.*, storage.*, users, profiles, companies, settings, permissions, roles, policy tables, GCAM tables, lexicon, reviewer academy, subscriptions, billing, organizations, tenants, or configuration tables.';
END $$;

-- ---------------------------------------------------------------------------
-- 4) Final summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Execution finished successfully.';
END $$;

-- ---------------------------------------------------------------------------
-- 5) Optional preview mode (count-only, no deletes)
-- ---------------------------------------------------------------------------
-- Enable this block manually if you want a dry run before clearing data.
-- It reports the row counts for the same operational tables and the optional
-- screenplay/content tables without deleting anything.
--
-- To use preview mode:
--   1) Comment out or skip the delete blocks above.
--   2) Run this block to inspect row counts only.
--
-- Note: This block is intentionally non-destructive.
/*
DO $$
DECLARE
  tbl_name text;
  tbl_regclass regclass;
  row_count bigint;
  preview_tables text[] := ARRAY[
    'public.analysis_review_finding_sources',
    'public.analysis_review_findings',
    'public.analysis_finding_policy_links',
    'public.analysis_finding_lineage_events',
    'public.analysis_v3_inspection',
    'public.analysis_prompt_replays',
    'public.analysis_runtime_traces',
    'public.analysis_judge_diagnostics',
    'public.analysis_investigations',
    'public.analysis_memory_traces',
    'public.analysis_memory_units',
    'public.analysis_engine_evaluations',
    'public.analysis_execution_signatures',
    'public.analysis_script_summary_locks',
    'public.analysis_script_summaries',
    'public.analysis_chunk_runs',
    'public.analysis_reports',
    'public.analysis_findings',
    'public.analysis_chunks',
    'public.analysis_jobs',
    -- Optional screenplay/content tables
    'public.scripts',
    'public.script_versions',
    'public.script_pages',
    'public.script_sections',
    'public.script_text',
    'public.script_status_history',
    'public.script_revision_cycles',
    'public.script_revision_cycle_events',
    'public.script_revision_cycle_snapshots',
    'public.script_revision_cycle_comparisons',
    'public.script_summaries',
    'public.analysis_caches',
    'public.analysis_embeddings'
  ];
BEGIN
  RAISE NOTICE '=== Analysis Factory Reset Preview Mode ===';
  FOREACH tbl_name IN ARRAY preview_tables LOOP
    tbl_regclass := to_regclass(tbl_name);
    IF tbl_regclass IS NULL THEN
      RAISE NOTICE 'PREVIEW skip missing table: %', tbl_name;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO row_count;
    RAISE NOTICE 'PREVIEW % rows = %', tbl_name, row_count;
  END LOOP;

  RAISE NOTICE 'PREVIEW MODE COMPLETE: no rows were deleted.';
END $$;
*/

-- ---------------------------------------------------------------------------
-- 6) Optional screenplay/content cleanup (commented out by default)
-- ---------------------------------------------------------------------------
-- This block is intentionally disabled. Uncomment it only if you also want to
-- remove uploaded screenplay/content artifacts in addition to analysis data.
--
-- Included only for completeness; it does not change the default behavior of
-- this script.
/*
DO $$
DECLARE
  tbl_name text;
  tbl_regclass regclass;
  before_count bigint;
  after_count bigint;
  content_tables text[] := ARRAY[
    'public.script_sections',
    'public.script_pages',
    'public.script_text',
    'public.script_summaries',
    'public.script_status_history',
    'public.script_revision_cycle_comparisons',
    'public.script_revision_cycle_snapshots',
    'public.script_revision_cycle_events',
    'public.script_revision_cycles',
    'public.script_versions',
    'public.scripts',
    'public.analysis_execution_signatures',
    'public.analysis_memory_traces',
    'public.analysis_memory_units',
    'public.analysis_caches',
    'public.analysis_embeddings'
  ];
BEGIN
  RAISE NOTICE '=== Optional screenplay/content cleanup ===';
  FOREACH tbl_name IN ARRAY content_tables LOOP
    tbl_regclass := to_regclass(tbl_name);
    IF tbl_regclass IS NULL THEN
      RAISE NOTICE 'SKIP missing table: %', tbl_name;
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO before_count;
    RAISE NOTICE 'BEFORE % = % rows', tbl_name, before_count;
    EXECUTE format('DELETE FROM %s', tbl_regclass);
    EXECUTE format('SELECT count(*) FROM %s', tbl_regclass) INTO after_count;
    RAISE NOTICE 'AFTER  % = % rows', tbl_name, after_count;
  END LOOP;
  RAISE NOTICE 'Optional screenplay/content cleanup finished.';
END $$;
*/
