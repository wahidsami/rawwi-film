alter table public.analysis_jobs
  add column if not exists partial_finalize_requested boolean not null default false,
  add column if not exists partial_finalize_requested_at timestamptz;

create index if not exists analysis_jobs_partial_finalize_requested_idx
  on public.analysis_jobs (created_at)
  where partial_finalize_requested = true;

comment on column public.analysis_jobs.partial_finalize_requested is
  'When true, the worker stops claiming new chunks and generates a partial report from completed work only.';

comment on column public.analysis_jobs.partial_finalize_requested_at is
  'Timestamp when partial finalization was requested by the user.';
