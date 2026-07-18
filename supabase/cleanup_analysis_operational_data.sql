-- Cleanup script for operational analysis artifacts only.
-- Preserves auth, users, companies, settings, policy tables, lexicon, reviewer academy, and configuration.
-- Optional script/script_version cleanup is commented out below.

BEGIN;

-- Child / diagnostic tables first.
DELETE FROM public.analysis_review_finding_sources;
DELETE FROM public.analysis_review_findings;
DELETE FROM public.analysis_finding_policy_links;
DELETE FROM public.analysis_engine_evaluations;
DELETE FROM public.analysis_prompt_replays;
DELETE FROM public.analysis_runtime_traces;
DELETE FROM public.analysis_v3_inspection;
DELETE FROM public.analysis_judge_diagnostics;
DELETE FROM public.analysis_execution_signatures;
DELETE FROM public.analysis_finding_lineage_events;
DELETE FROM public.analysis_memory_traces;
DELETE FROM public.analysis_memory_units;
DELETE FROM public.analysis_investigations;
DELETE FROM public.analysis_script_summaries;
DELETE FROM public.analysis_script_summary_locks;
DELETE FROM public.analysis_chunk_runs;

-- Core analysis tables.
DELETE FROM public.analysis_findings;
DELETE FROM public.analysis_reports;
DELETE FROM public.analysis_chunks;
DELETE FROM public.analysis_jobs;

-- Optional: also clear uploaded scripts and versions if you explicitly want to reset the source content.
-- DELETE FROM public.script_versions;
-- DELETE FROM public.scripts;

COMMIT;
