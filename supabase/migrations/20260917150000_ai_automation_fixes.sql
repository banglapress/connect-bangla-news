-- AI newsroom automation + cover prompt approval. Additive and safe to re-run.

alter table if exists public.desk_stories
  add column if not exists cover_prompt text;

alter table if exists public.desk_stories
  add column if not exists auto_processing_started_at timestamptz;

create index if not exists desk_stories_auto_processing_idx
  on public.desk_stories (status, created_at desc, auto_processing_started_at);

notify pgrst, 'reload schema';
