-- Shared catalog + private per-user matching for JobFinder.
-- The service-role importer is the only writer to job_catalog/import runs.

create extension if not exists pgcrypto;

create table if not exists public.job_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text not null,
  source_url text not null,
  title text not null,
  company_name text not null,
  company_logo_url text,
  company_website text,
  company_description text,
  industry text,
  location text,
  remote_type text,
  description text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  salary_text text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  seniority text,
  experience_required text,
  employment_type text,
  languages jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_updated_at timestamptz,
  description_hash text,
  is_active boolean not null default true,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_catalog_source_job_unique unique (source, source_job_id),
  constraint job_catalog_source_url_unique unique (source_url),
  constraint job_catalog_description_length check (char_length(description) >= 80)
);

create table if not exists public.user_job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.job_catalog(id) on delete cascade,
  fit_score numeric(4,2) not null default 0 check (fit_score between 0 and 10),
  matched_preferences jsonb not null default '{}'::jsonb,
  why_fit jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  angle jsonb not null default '[]'::jsonb,
  status text not null default 'NEW' check (status in ('NEW','REVIEW','APPLY','APPLIED','CONTACTED','INTERVIEW','OFFER','CLOSED')),
  priority boolean not null default false,
  referral boolean not null default false,
  dismissed boolean not null default false,
  first_proposed_at timestamptz not null default now(),
  last_proposed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_job_matches_user_job_unique unique (user_id, job_id)
);

create table if not exists public.source_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  fetched_count integer not null default 0,
  accepted_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.jobs add column if not exists catalog_job_id uuid references public.job_catalog(id) on delete set null;

create index if not exists job_catalog_active_published_idx on public.job_catalog (published_at desc) where is_active;
create index if not exists job_catalog_company_idx on public.job_catalog (lower(company_name));
create index if not exists job_catalog_last_seen_idx on public.job_catalog (last_seen_at desc);
create index if not exists user_job_matches_user_status_idx on public.user_job_matches (user_id, status, dismissed, fit_score desc);
create index if not exists user_job_matches_job_idx on public.user_job_matches (job_id);
create index if not exists source_import_runs_source_started_idx on public.source_import_runs (source, started_at desc);
create index if not exists jobs_catalog_job_idx on public.jobs (catalog_job_id) where catalog_job_id is not null;

alter table public.job_catalog enable row level security;
alter table public.user_job_matches enable row level security;
alter table public.source_import_runs enable row level security;

revoke all on public.job_catalog, public.user_job_matches, public.source_import_runs from anon, authenticated;
grant select on public.job_catalog to authenticated;
grant select, insert, update, delete on public.user_job_matches to authenticated;

drop policy if exists "authenticated users read active catalog" on public.job_catalog;
create policy "authenticated users read active catalog"
  on public.job_catalog for select to authenticated
  using (is_active = true);

drop policy if exists "users read own matches" on public.user_job_matches;
create policy "users read own matches"
  on public.user_job_matches for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own matches" on public.user_job_matches;
create policy "users insert own matches"
  on public.user_job_matches for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own matches" on public.user_job_matches;
create policy "users update own matches"
  on public.user_job_matches for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own matches" on public.user_job_matches;
create policy "users delete own matches"
  on public.user_job_matches for delete to authenticated
  using ((select auth.uid()) = user_id);
