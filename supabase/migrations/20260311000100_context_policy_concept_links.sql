-- Hybrid V3: policy concept mapping, finding links, and evaluation telemetry.

create table if not exists public.policy_atom_concepts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title_ar text not null,
  description_ar text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_article_atom_map (
  id uuid primary key default gen_random_uuid(),
  article_id integer not null,
  atom_concept_id uuid not null references public.policy_atom_concepts(id) on delete cascade,
  local_atom_code text,
  rationale_ar text,
  overlap_type text not null default 'primary',
  priority integer not null default 1,
  source text not null default 'manual',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_policy_article_atom_active
  on public.policy_article_atom_map(article_id, atom_concept_id, is_active);

create table if not exists public.analysis_finding_policy_links (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.analysis_findings(id) on delete cascade,
  article_id integer not null,
  atom_concept_id uuid not null references public.policy_atom_concepts(id) on delete cascade,
  map_id uuid references public.policy_article_atom_map(id) on delete set null,
  link_role text not null default 'primary',
  confidence double precision not null default 0,
  rationale_ar text,
  created_by_model text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_finding_policy_link
  on public.analysis_finding_policy_links(finding_id, article_id, atom_concept_id);

create index if not exists ix_finding_policy_links_finding
  on public.analysis_finding_policy_links(finding_id);

create table if not exists public.lexicon_term_policy_links (
  id uuid primary key default gen_random_uuid(),
  lexicon_id uuid not null references public.slang_lexicon(id) on delete cascade,
  article_id integer not null,
  atom_concept_id uuid references public.policy_atom_concepts(id) on delete set null,
  map_id uuid references public.policy_article_atom_map(id) on delete set null,
  rationale_ar text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_lexicon_policy_link
  on public.lexicon_term_policy_links(lexicon_id, article_id, atom_concept_id);

create table if not exists public.analysis_engine_evaluations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  chunk_id uuid not null references public.analysis_chunks(id) on delete cascade,
  run_key text not null,
  engine text not null,
  mode text not null,
  baseline_count integer not null default 0,
  hybrid_count integer not null default 0,
  baseline_contradictions integer not null default 0,
  baseline_severe_disagreements integer not null default 0,
  hybrid_context_ok integer not null default 0,
  hybrid_needs_review integer not null default 0,
  hybrid_violation integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ix_analysis_engine_eval_job on public.analysis_engine_evaluations(job_id);
create index if not exists ix_analysis_engine_eval_chunk on public.analysis_engine_evaluations(chunk_id);
