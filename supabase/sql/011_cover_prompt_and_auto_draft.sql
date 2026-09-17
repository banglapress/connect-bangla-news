alter table if exists public.desk_stories
  add column if not exists cover_prompt text;
