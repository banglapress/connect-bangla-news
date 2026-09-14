-- Phase 3 foundation. Does not delete desk_stories or public articles.

alter table public.desk_stories add column if not exists research_status text not null default 'pending';
alter table public.desk_stories add column if not exists research_packet jsonb;
alter table public.desk_stories add column if not exists cluster_group_id uuid;

create table if not exists public.desk_source_claims (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  source_row_id uuid references public.desk_story_sources(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  source_url text,
  claim_text text not null,
  claim_type text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists public.desk_fact_checks (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  fact_text text not null,
  status text not null default 'unverified',
  supporting_source_ids uuid[] not null default '{}',
  conflicting_source_ids uuid[] not null default '{}',
  confidence numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists desk_source_claims_story_idx on public.desk_source_claims (story_id);
create index if not exists desk_fact_checks_story_idx on public.desk_fact_checks (story_id);

alter table public.desk_source_claims enable row level security;
alter table public.desk_fact_checks enable row level security;
drop policy if exists desk_source_claims_all on public.desk_source_claims;
create policy desk_source_claims_all on public.desk_source_claims for all to authenticated using (true) with check (true);
drop policy if exists desk_fact_checks_all on public.desk_fact_checks;
create policy desk_fact_checks_all on public.desk_fact_checks for all to authenticated using (true) with check (true);
