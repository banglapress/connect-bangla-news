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


-- Reconcile historical rows so already-finished/published work leaves the
-- active queue, and exhausted retries require human review.
update public.desk_stories as ds
set
  status = 'published',
  auto_processing_started_at = null,
  auto_next_attempt_at = null,
  auto_failure_stage = null,
  warning = null,
  last_error = null,
  updated_at = now()
from public.articles as a
where ds.article_id = a.id
  and a.status = 'published'
  and ds.status <> 'published';

update public.desk_stories
set
  status = 'review',
  auto_processing_started_at = null,
  auto_next_attempt_at = null,
  warning = 'Auto-draft stopped after 3 attempts; manual review required.',
  updated_at = now()
where status = 'new'
  and coalesce(auto_attempts, 0) >= 3;

-- Normalize legacy retry schedules created by the previous policy:
-- attempt 1 retries in 15 minutes, attempt 2 retries in 30 minutes.
update public.desk_stories
set
  auto_next_attempt_at = now() + interval '15 minutes',
  warning = 'Auto-draft retry scheduled in 15 minutes (' || coalesce(auto_failure_stage, 'processing') || ').',
  updated_at = now()
where status = 'new'
  and coalesce(auto_attempts, 0) = 1
  and article_id is null;

update public.desk_stories
set
  auto_next_attempt_at = now() + interval '30 minutes',
  warning = 'Auto-draft retry scheduled in 30 minutes (' || coalesce(auto_failure_stage, 'processing') || ').',
  updated_at = now()
where status = 'new'
  and coalesce(auto_attempts, 0) = 2
  and article_id is null;


-- Requeue only stories that the previous auto-draft retry policy exhausted.
-- These rows are identifiable by the automatic stop warning and no article_id.
-- They get a fresh attempt after the Gemini reliability fixes.
update public.desk_stories
set
  status = 'new',
  auto_attempts = 0,
  auto_processing_started_at = null,
  auto_next_attempt_at = now(),
  auto_failure_stage = null,
  last_error = null,
  warning = 'Re-queued after AI Desk automation fix.',
  updated_at = now()
where status = 'review'
  and article_id is null
  and warning = 'Auto-draft stopped after 3 attempts; manual review required.';

create index if not exists desk_stories_article_id_idx
  on public.desk_stories (article_id);

notify pgrst, 'reload schema';

commit;
