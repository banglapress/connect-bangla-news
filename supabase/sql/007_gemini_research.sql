-- Gemini research + AI draft columns. Additive. Safe to re-run.
-- Does not change public articles schema beyond existing draft/published status.

alter table public.desk_stories add column if not exists research_provider text;
alter table public.desk_stories add column if not exists research_model text;
alter table public.desk_stories add column if not exists research_generated_at timestamptz;
alter table public.desk_stories add column if not exists article_status text;
alter table public.desk_stories add column if not exists article_model text;
alter table public.desk_stories add column if not exists article_generated_at timestamptz;
alter table public.desk_stories add column if not exists article_warnings jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
