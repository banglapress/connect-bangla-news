-- Phase 7: AI article cover images. Additive. Safe to re-run.

create table if not exists public.desk_story_images (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  article_id uuid references public.articles(id) on delete set null,
  provider text not null default 'gemini',
  model text,
  prompt_version text,
  source_type text not null default 'generated',
  aspect_ratio text,
  image_url text,
  social_image_url text,
  storage_path text,
  visual_concept text,
  prompt_text text,
  is_selected boolean not null default false,
  generation_status text not null default 'pending',
  duration_ms integer,
  width integer,
  height integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists desk_story_images_story_idx on public.desk_story_images (story_id, created_at desc);
create index if not exists desk_story_images_selected_idx on public.desk_story_images (story_id) where is_selected;

alter table public.desk_stories add column if not exists cover_image_id uuid;
alter table public.desk_stories add column if not exists cover_image_url text;
alter table public.desk_stories add column if not exists cover_social_url text;
alter table public.desk_stories add column if not exists cover_status text;
alter table public.desk_stories add column if not exists cover_generated_at timestamptz;

alter table public.desk_story_images enable row level security;

drop policy if exists desk_story_images_staff_all on public.desk_story_images;
create policy desk_story_images_staff_all
  on public.desk_story_images
  for all
  using (true)
  with check (true);

notify pgrst, 'reload schema';
