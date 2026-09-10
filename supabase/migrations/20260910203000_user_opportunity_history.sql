-- Persistent per-user proposal history used when the shared catalog importer
-- is unavailable. This prevents removed or previously shown opportunities
-- from being proposed again on a later refresh.
create table if not exists public.user_opportunity_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_key text not null,
  source_url text,
  first_proposed_at timestamptz not null default now(),
  last_proposed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_opportunity_history_user_key_unique unique (user_id, opportunity_key)
);

create index if not exists user_opportunity_history_user_last_idx
  on public.user_opportunity_history (user_id, last_proposed_at desc);

alter table public.user_opportunity_history enable row level security;

revoke all on public.user_opportunity_history from anon;
grant select, insert, update, delete on public.user_opportunity_history to authenticated;

drop policy if exists "users read own opportunity history" on public.user_opportunity_history;
create policy "users read own opportunity history"
  on public.user_opportunity_history for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own opportunity history" on public.user_opportunity_history;
create policy "users insert own opportunity history"
  on public.user_opportunity_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own opportunity history" on public.user_opportunity_history;
create policy "users update own opportunity history"
  on public.user_opportunity_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own opportunity history" on public.user_opportunity_history;
create policy "users delete own opportunity history"
  on public.user_opportunity_history for delete to authenticated
  using ((select auth.uid()) = user_id);
