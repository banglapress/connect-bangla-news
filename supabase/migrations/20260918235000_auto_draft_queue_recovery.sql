-- The Connect AI Desk
-- Auto-draft queue recovery and retry metadata.
-- Idempotent for Supabase SQL Editor and migration runs.
--
-- This migration is intentionally self-contained for all queue-lock/retry
-- columns used by the current auto-draft worker.

begin;

do $$
begin
  if to_regclass('public.desk_stories') is null then
    raise exception 'Required table public.desk_stories does not exist. Run the editorial desk schema migration first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'desk_stories'
      and column_name = 'auto_processing_started_at'
  ) then
    alter table public.desk_stories
      add column auto_processing_started_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'desk_stories'
      and column_name = 'auto_attempts'
  ) then
    alter table public.desk_stories
      add column auto_attempts integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'desk_stories'
      and column_name = 'auto_next_attempt_at'
  ) then
    alter table public.desk_stories
      add column auto_next_attempt_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'desk_stories'
      and column_name = 'auto_failure_stage'
  ) then
    alter table public.desk_stories
      add column auto_failure_stage text;
  end if;
end
$$;

create index if not exists desk_stories_auto_queue_idx
  on public.desk_stories (status, auto_next_attempt_at, updated_at desc);

create index if not exists desk_stories_auto_lock_idx
  on public.desk_stories (auto_processing_started_at)
  where auto_processing_started_at is not null;

create index if not exists desk_stories_auto_claim_idx
  on public.desk_stories (
    status,
    auto_processing_started_at,
    auto_next_attempt_at,
    updated_at desc
  )
  where article_id is null;

notify pgrst, 'reload schema';

commit;
