-- The Connect: Feature / Explainer editorial workflow
-- Additive and safe to rerun.
-- After deploy, run this once in Supabase SQL Editor.

begin;

alter table public.desk_stories
  add column if not exists editorial_type text not null default 'news',
  add column if not exists editorial_brief jsonb,
  add column if not exists angle_status text not null default 'pending',
  add column if not exists approved_angle jsonb,
  add column if not exists editorial_outline jsonb,
  add column if not exists editorial_provider text,
  add column if not exists editorial_model text,
  add column if not exists editorial_generated_at timestamptz;

alter table public.articles
  add column if not exists editorial_type text not null default 'news';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'desk_stories_editorial_type_check'
      and conrelid = 'public.desk_stories'::regclass
  ) then
    alter table public.desk_stories
      add constraint desk_stories_editorial_type_check
      check (editorial_type in ('news', 'explainer', 'feature'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'desk_stories_angle_status_check'
      and conrelid = 'public.desk_stories'::regclass
  ) then
    alter table public.desk_stories
      add constraint desk_stories_angle_status_check
      check (angle_status in ('pending', 'ready', 'approved'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'articles_editorial_type_check'
      and conrelid = 'public.articles'::regclass
  ) then
    alter table public.articles
      add constraint articles_editorial_type_check
      check (editorial_type in ('news', 'explainer', 'feature'));
  end if;
end
$$;

create index if not exists desk_stories_editorial_type_idx
  on public.desk_stories (editorial_type, updated_at desc);

create index if not exists articles_editorial_type_idx
  on public.articles (editorial_type, published_at desc);

notify pgrst, 'reload schema';

commit;