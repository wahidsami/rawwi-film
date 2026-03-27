alter table public.analysis_chunks
  add column if not exists judging_started_at timestamptz null;

comment on column public.analysis_chunks.judging_started_at is
  'Timestamp when the worker claimed the chunk into judging status; used for stale in-flight recovery.';
