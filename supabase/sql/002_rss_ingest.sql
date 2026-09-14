-- Phase 2: RSS ingest columns. Run once in Supabase SQL Editor.

alter table public.news_sources add column if not exists last_fetched_at timestamptz;
alter table public.news_sources add column if not exists last_success_at timestamptz;
alter table public.news_sources add column if not exists last_error text;

alter table public.desk_story_sources add column if not exists published_at timestamptz;
alter table public.desk_story_sources add column if not exists image_url text;
alter table public.desk_story_sources add column if not exists canonical_url text;

create index if not exists desk_story_sources_canonical_idx
  on public.desk_story_sources (canonical_url);
