create table if not exists public.report_builder_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source text not null check (source in ('scripts', 'reports', 'users', 'audit', 'performance')),
  template_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_builder_templates_user_id_updated_at
  on public.report_builder_templates(user_id, updated_at desc);

drop trigger if exists report_builder_templates_updated_at on public.report_builder_templates;
create trigger report_builder_templates_updated_at
  before update on public.report_builder_templates
  for each row execute function set_updated_at();

alter table public.report_builder_templates enable row level security;

drop policy if exists "Users can view their own report builder templates" on public.report_builder_templates;
create policy "Users can view their own report builder templates"
on public.report_builder_templates
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own report builder templates" on public.report_builder_templates;
create policy "Users can insert their own report builder templates"
on public.report_builder_templates
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own report builder templates" on public.report_builder_templates;
create policy "Users can update their own report builder templates"
on public.report_builder_templates
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own report builder templates" on public.report_builder_templates;
create policy "Users can delete their own report builder templates"
on public.report_builder_templates
for delete
using (auth.uid() = user_id);

comment on table public.report_builder_templates is
'Per-user saved report builder templates. Each row stores one reusable builder configuration for the logged-in internal user.';
