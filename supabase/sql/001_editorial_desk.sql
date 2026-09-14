-- The Connect editorial desk — Phase 1 schema
-- Run once in Supabase SQL Editor. Safe to re-run.

create table if not exists public.writers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  bio text,
  photo_url text,
  email text,
  managed_by_desk boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  homepage_url text,
  rss_url text,
  api_url text,
  category_slug text,
  active boolean not null default true,
  trust_level int not null default 3 check (trust_level between 1 and 5),
  priority int not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.desk_stories (
  id uuid primary key default gen_random_uuid(),
  cluster_key text unique,
  title_hint text,
  category_slug text,
  status text not null default 'new'
    check (status in ('new','researching','draft','review','approved','published','rejected')),
  source_count int not null default 0,
  confirmed_facts jsonb not null default '[]'::jsonb,
  conflicting_facts jsonb not null default '[]'::jsonb,
  unverified_claims jsonb not null default '[]'::jsonb,
  draft_title text,
  draft_excerpt text,
  draft_body text,
  seo_title text,
  meta_description text,
  tags text[] not null default '{}',
  social_caption text,
  card_headline text,
  card_support text,
  card_image_url text,
  article_id uuid,
  facebook_post_id text,
  auto_publish_ready boolean not null default false,
  warning text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.desk_story_sources (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  url text not null,
  title text,
  excerpt text,
  raw_text text,
  extracted_facts jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (url)
);

create table if not exists public.desk_jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.desk_stories(id) on delete cascade,
  stage text not null,
  status text not null default 'queued'
    check (status in ('queued','running','ok','failed')),
  attempt int not null default 0,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.desk_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists desk_stories_status_idx on public.desk_stories (status, updated_at desc);
create index if not exists desk_story_sources_story_idx on public.desk_story_sources (story_id);
create index if not exists desk_jobs_story_idx on public.desk_jobs (story_id, created_at desc);
create index if not exists news_sources_active_idx on public.news_sources (active, priority);

alter table public.writers enable row level security;
alter table public.news_sources enable row level security;
alter table public.desk_stories enable row level security;
alter table public.desk_story_sources enable row level security;
alter table public.desk_jobs enable row level security;
alter table public.desk_settings enable row level security;

drop policy if exists writers_read on public.writers;
drop policy if exists writers_write on public.writers;
create policy writers_read on public.writers for select using (true);
create policy writers_write on public.writers for all to authenticated using (true) with check (true);

drop policy if exists news_sources_read on public.news_sources;
drop policy if exists news_sources_write on public.news_sources;
create policy news_sources_read on public.news_sources for select to authenticated using (true);
create policy news_sources_write on public.news_sources for all to authenticated using (true) with check (true);

drop policy if exists desk_stories_all on public.desk_stories;
create policy desk_stories_all on public.desk_stories for all to authenticated using (true) with check (true);

drop policy if exists desk_story_sources_all on public.desk_story_sources;
create policy desk_story_sources_all on public.desk_story_sources for all to authenticated using (true) with check (true);

drop policy if exists desk_jobs_all on public.desk_jobs;
create policy desk_jobs_all on public.desk_jobs for all to authenticated using (true) with check (true);

drop policy if exists desk_settings_all on public.desk_settings;
create policy desk_settings_all on public.desk_settings for all to authenticated using (true) with check (true);

insert into public.desk_settings (key, value)
values
  ('ingest_interval_minutes', '30'::jsonb),
  ('style_rules', '{"tone":"neutral","language":"bn-BD","max_adjectives":"low","no_fabricated_facts":true}'::jsonb),
  ('card_template', '{"ratio":"4:5","brand":"The Connect"}'::jsonb),
  ('category_auto_publish', '{}'::jsonb)
on conflict (key) do nothing;

insert into public.news_sources (name, homepage_url, rss_url, category_slug, active, trust_level, priority)
select * from (values
  ('BBC Bangla', 'https://www.bbc.com/bengali', 'https://feeds.bbci.co.uk/bengali/rss.xml', 'international', true, 5, 10),
  ('DW Bangla', 'https://www.dw.com/bn', 'https://rss.dw.com/rdf/rss-ben-all', 'international', true, 5, 20),
  ('Prothom Alo', 'https://www.prothomalo.com', 'https://www.prothomalo.com/feed/', 'national', true, 4, 30),
  ('bdnews24 Bangla', 'https://bangla.bdnews24.com', 'https://bangla.bdnews24.com/?widgetName=rssfeed&widgetContentId=00000000-0000-0000-0000-000000000000', 'national', false, 3, 40)
) as seed(name, homepage_url, rss_url, category_slug, active, trust_level, priority)
where not exists (select 1 from public.news_sources s where s.name = seed.name);
