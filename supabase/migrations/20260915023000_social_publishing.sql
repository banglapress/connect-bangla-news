-- Phase 6: photo card + Facebook publishing. Additive. Safe to re-run.
-- Does not alter public articles rows or existing research/article columns.

alter table public.desk_stories add column if not exists card_ratio text;
alter table public.desk_stories add column if not exists card_generated_at timestamptz;
alter table public.desk_stories add column if not exists facebook_status text;
alter table public.desk_stories add column if not exists facebook_published_at timestamptz;
alter table public.desk_stories add column if not exists facebook_error text;
alter table public.desk_stories add column if not exists facebook_page_name text;

insert into public.desk_settings (key, value)
values
  ('card_template', '{"brand":"The Connect","ratio":"4:5","accent":"#9B1D1F","background":"#F6F1E8","text":"#16110C","logoUrl":"/logo.png"}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
