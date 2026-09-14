-- Discovery layer + blocked RSS policy. Does not delete stories/articles.

alter table public.news_sources add column if not exists source_kind text not null default 'other';
alter table public.news_sources add column if not exists discovery_mode text not null default 'rss';
alter table public.news_sources add column if not exists access_status text not null default 'ok';

alter table public.desk_story_sources add column if not exists origin text not null default 'rss';
alter table public.desk_story_sources add column if not exists trusted boolean not null default false;

update public.news_sources
set discovery_mode = 'blocked',
    access_status = 'access_denied',
    source_kind = 'major_news',
    last_error = 'access_denied: RSS blocked (HTTP 403 / Cloudflare)',
    updated_at = now()
where name ilike '%bdnews24%';

update public.news_sources
set discovery_mode = 'manual',
    access_status = 'no_feed',
    source_kind = 'news_agency',
    updated_at = now()
where name ilike '%Sangbad Sangstha%' or name ilike 'BSS%';

create table if not exists public.desk_discovery_hits (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  provider text not null default 'gdelt',
  title text,
  url text not null,
  domain text,
  published_at timestamptz,
  relevance numeric,
  raw jsonb not null default '{}'::jsonb,
  added boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists desk_discovery_hits_story_idx on public.desk_discovery_hits (story_id, created_at desc);
alter table public.desk_discovery_hits enable row level security;
drop policy if exists desk_discovery_hits_all on public.desk_discovery_hits;
create policy desk_discovery_hits_all on public.desk_discovery_hits for all to authenticated using (true) with check (true);
