-- Deep multi-source research + long-form article metadata. Additive. Safe to re-run.

alter table public.desk_stories add column if not exists article_depth text;
alter table public.desk_stories add column if not exists research_version integer;
alter table public.desk_stories add column if not exists source_utilization jsonb not null default '[]'::jsonb;
alter table public.desk_stories add column if not exists research_quality jsonb;
alter table public.desk_stories add column if not exists article_word_count integer;
alter table public.desk_stories add column if not exists article_quality jsonb;

notify pgrst, 'reload schema';
