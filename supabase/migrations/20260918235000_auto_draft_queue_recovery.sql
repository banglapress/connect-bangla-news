-- Auto-draft queue recovery and retry metadata.
-- Safe to run once; all changes are additive.

alter table if exists public.desk_stories
  add column if not exists auto_attempts integer not null default 0;

alter table if exists public.desk_stories
  add column if not exists auto_next_attempt_at timestamptz;

alter table if not exists public.desk_stories
  add column if not exists auto_failure_stage text;

create index if not exists desk_stories_auto_queue_idx
  on public.desk_stories (status, auto_next_attempt_at, updated_at desc);

create index if not exists desk_stories_auto_lock_idx
  on public.desk_stories (auto_processing_started_at)
  where auto_processing_started_at is not null;

notify pgrst, 'reload schema';
