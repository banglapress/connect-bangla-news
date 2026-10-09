-- The Connect complete Supabase bootstrap + demo data
-- Use this on the dedicated News Supabase project.
-- IMPORTANT: this resets only The Connect application's public tables/functions
-- and the news-images storage bucket. It does NOT delete auth.users.
-- It is designed so a partially-initialized fresh project can be rebuilt cleanly.

begin;

-- ---------------------------------------------------------------------------
-- Clean reset of application-owned objects
-- ---------------------------------------------------------------------------

drop function if exists public.handle_new_user() cascade;
drop function if exists public.has_role(uuid, public.app_role) cascade;
drop function if exists public.is_staff(uuid) cascade;
drop function if exists public.ensure_first_admin() cascade;
drop function if exists public.protect_last_admin() cascade;
drop function if exists public.set_updated_at() cascade;

drop table if exists public.desk_story_images cascade;
drop table if exists public.desk_discovery_hits cascade;
drop table if exists public.desk_fact_checks cascade;
drop table if exists public.desk_source_claims cascade;
drop table if exists public.desk_story_sources cascade;
drop table if exists public.desk_jobs cascade;
drop table if exists public.desk_settings cascade;
drop table if exists public.desk_stories cascade;
drop table if exists public.news_sources cascade;
drop table if exists public.writers cascade;
drop table if exists public.articles cascade;
drop table if exists public.categories cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.profiles cascade;

drop type if exists public.app_role cascade;

-- Do not delete rows directly from storage.objects/storage.buckets.
-- Supabase protects these tables from direct destructive SQL operations.
-- The bucket is created or normalized below through its metadata insert.

-- ---------------------------------------------------------------------------
-- Roles / profiles
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.app_role as enum (
    'admin',
    'editor',
    'reporter',
    'sub_editor',
    'news_editor',
    'subscriber'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by all" on public.profiles;
create policy "profiles readable by all"
  on public.profiles for select using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

revoke all privileges on table public.user_roles from anon, public, authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;
grant all privileges on table public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('admin','editor','news_editor','sub_editor','reporter')
  )
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_staff(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_staff(uuid) to authenticated, service_role;

drop policy if exists "own roles readable" on public.user_roles;
create policy "own roles readable"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins insert roles" on public.user_roles;
create policy "admins insert roles"
  on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "admins update roles" on public.user_roles;
create policy "admins update roles"
  on public.user_roles for update to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

drop policy if exists "admins delete roles" on public.user_roles;
create policy "admins delete roles"
  on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- New accounts never receive editorial roles automatically.
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rebuild profiles for any Auth accounts that already existed.
insert into public.profiles (id, display_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- Admin assignment is manual: promote the intended owner account from SQL Editor.


create or replace function public.ensure_first_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('admin', 'editor')
  );
$$;

revoke all on function public.ensure_first_admin() from public, anon;
grant execute on function public.ensure_first_admin() to authenticated, service_role;

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into admin_count
    from public.user_roles
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'অন্তত একজন অ্যাডমিন থাকতে হবে';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_last_admin() from public, anon, authenticated;

drop trigger if exists user_roles_protect_last_admin on public.user_roles;
create trigger user_roles_protect_last_admin
before update or delete on public.user_roles
for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------------
-- Categories / public articles
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  parent_id uuid references public.categories(id) on delete set null,
  show_in_nav boolean not null default true,
  nav_order int not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;

drop policy if exists "categories public read" on public.categories;
create policy "categories public read"
  on public.categories for select using (true);

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories"
  on public.categories for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.categories (name, slug, sort_order, nav_order)
values
  ('জাতীয়','national',1,1),
  ('আন্তর্জাতিক','international',2,2),
  ('খেলা','sports',3,3),
  ('অর্থনীতি','economy',4,4),
  ('বাণিজ্য','business',5,5),
  ('লাইফস্টাইল','lifestyle',6,6),
  ('মতামত','opinion',7,7),
  ('শিক্ষা','education',8,8),
  ('সংস্কৃতি','culture',9,9),
  ('প্রবাস','probash',10,10),
  ('বিনোদন','entertainment',11,11)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    nav_order = excluded.nav_order;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  body text not null default '',
  category_slug text not null references public.categories(slug) on update cascade,
  tags text[] not null default '{}',
  image_url text,
  image_caption text,
  author_name text not null default 'নিজস্ব প্রতিবেদক',
  author_id uuid references auth.users(id) on delete set null,
  is_lead boolean not null default false,
  is_featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  views int not null default 0,
  public_id text unique,
  content_type text not null default 'article' check (content_type in ('article','video')),
  youtube_url text,
  image_urls text[] not null default '{}',
  editorial_type text not null default 'news' check (editorial_type in ('news','explainer','feature')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_category_idx on public.articles (category_slug, published_at desc);
create index if not exists articles_status_idx on public.articles (status, published_at desc);
create index if not exists articles_editorial_type_idx on public.articles (editorial_type, published_at desc);

grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;
grant all on public.articles to service_role;
alter table public.articles enable row level security;

drop policy if exists "published articles public read" on public.articles;
create policy "published articles public read"
  on public.articles for select using (status = 'published');

drop policy if exists "staff read all articles" on public.articles;
create policy "staff read all articles"
  on public.articles for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists "staff insert articles" on public.articles;
create policy "staff insert articles"
  on public.articles for insert to authenticated
  with check (public.is_staff(auth.uid()));

drop policy if exists "staff update articles" on public.articles;
create policy "staff update articles"
  on public.articles for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "staff delete articles" on public.articles;
create policy "staff delete articles"
  on public.articles for delete to authenticated
  using (public.is_staff(auth.uid()));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists articles_updated_at on public.articles;
create trigger articles_updated_at
before update on public.articles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Editorial Desk / AI automation
-- ---------------------------------------------------------------------------

create table if not exists public.writers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  bio text,
  photo_url text,
  email text,
  managed_by_desk boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  homepage_url text,
  rss_url text,
  api_url text,
  category_slug text,
  active boolean not null default true,
  trust_level int not null default 3 check (trust_level between 1 and 5),
  priority int not null default 100,
  notes text,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  source_kind text not null default 'other',
  discovery_mode text not null default 'rss',
  access_status text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The seed uses ON CONFLICT (name), so this unique index is required.
create unique index if not exists news_sources_name_uidx on public.news_sources (name);

create table if not exists public.desk_stories (
  id uuid primary key default gen_random_uuid(),
  cluster_key text unique,
  title_hint text,
  category_slug text,
  status text not null default 'new'
    check (status in ('new','researching','draft','review','approved','published','rejected')),
  source_count int not null default 0,
  confirmed_facts jsonb not null default '[]'::jsonb,
  conflicting_facts jsonb not null default '[]'::jsonb,
  unverified_claims jsonb not null default '[]'::jsonb,
  draft_title text,
  draft_excerpt text,
  draft_body text,
  seo_title text,
  meta_description text,
  tags text[] not null default '{}',
  social_caption text,
  card_headline text,
  card_support text,
  card_image_url text,
  article_id uuid,
  facebook_post_id text,
  auto_publish_ready boolean not null default false,
  warning text,
  last_error text,
  research_status text not null default 'pending',
  research_packet jsonb,
  cluster_group_id uuid,
  research_provider text,
  research_model text,
  research_generated_at timestamptz,
  article_status text,
  article_model text,
  article_generated_at timestamptz,
  article_warnings jsonb not null default '[]'::jsonb,
  card_ratio text,
  card_generated_at timestamptz,
  facebook_status text,
  facebook_published_at timestamptz,
  facebook_error text,
  facebook_page_name text,
  article_depth text,
  research_version integer,
  source_utilization jsonb not null default '[]'::jsonb,
  research_quality jsonb,
  article_word_count integer,
  article_quality jsonb,
  cover_prompt text,
  auto_processing_started_at timestamptz,
  auto_attempts integer not null default 0,
  auto_next_attempt_at timestamptz,
  auto_failure_stage text,
  cover_image_id uuid,
  cover_image_url text,
  cover_social_url text,
  cover_status text,
  cover_generated_at timestamptz,
  editorial_type text not null default 'news'
    check (editorial_type in ('news','explainer','feature')),
  editorial_brief jsonb,
  angle_status text not null default 'pending'
    check (angle_status in ('pending','ready','approved')),
  approved_angle jsonb,
  editorial_outline jsonb,
  editorial_provider text,
  editorial_model text,
  editorial_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.desk_story_sources (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  url text not null,
  title text,
  excerpt text,
  raw_text text,
  extracted_facts jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  published_at timestamptz,
  image_url text,
  canonical_url text,
  origin text not null default 'rss',
  trusted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (url)
);

create table if not exists public.desk_jobs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.desk_stories(id) on delete cascade,
  stage text not null,
  status text not null default 'queued'
    check (status in ('queued','running','ok','failed')),
  attempt int not null default 0,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.desk_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.desk_source_claims (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  source_row_id uuid references public.desk_story_sources(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  source_url text,
  claim_text text not null,
  claim_type text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists public.desk_fact_checks (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  fact_text text not null,
  status text not null default 'unverified',
  supporting_source_ids uuid[] not null default '{}',
  conflicting_source_ids uuid[] not null default '{}',
  confidence numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.desk_discovery_hits (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.desk_stories(id) on delete cascade,
  provider text not null default 'gdelt',
  title text,
  url text not null,
  domain text,
  published_at timestamptz,
  relevance numeric,
  raw jsonb not null default '{}'::jsonb,
  added boolean not null default false,
  snippet text,
  query text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

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

create index if not exists desk_stories_status_idx on public.desk_stories (status, updated_at desc);
create index if not exists desk_story_sources_story_idx on public.desk_story_sources (story_id);
create index if not exists desk_jobs_story_idx on public.desk_jobs (story_id, created_at desc);
create index if not exists news_sources_active_idx on public.news_sources (active, priority);
create index if not exists desk_source_claims_story_idx on public.desk_source_claims (story_id);
create index if not exists desk_fact_checks_story_idx on public.desk_fact_checks (story_id);
create index if not exists desk_discovery_hits_story_idx on public.desk_discovery_hits (story_id, created_at desc);
create unique index if not exists desk_discovery_hits_story_url_uidx on public.desk_discovery_hits (story_id, url);
create index if not exists desk_story_images_story_idx on public.desk_story_images (story_id, created_at desc);
create index if not exists desk_story_images_selected_idx on public.desk_story_images (story_id) where is_selected;
create index if not exists desk_stories_auto_processing_idx
  on public.desk_stories (status, created_at desc, auto_processing_started_at);
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
create index if not exists desk_stories_article_id_idx on public.desk_stories (article_id);
create index if not exists desk_stories_editorial_type_idx
  on public.desk_stories (editorial_type, updated_at desc);

alter table public.writers enable row level security;
alter table public.news_sources enable row level security;
alter table public.desk_stories enable row level security;
alter table public.desk_story_sources enable row level security;
alter table public.desk_jobs enable row level security;
alter table public.desk_settings enable row level security;
alter table public.desk_source_claims enable row level security;
alter table public.desk_fact_checks enable row level security;
alter table public.desk_discovery_hits enable row level security;
alter table public.desk_story_images enable row level security;

drop policy if exists writers_read on public.writers;
drop policy if exists writers_write on public.writers;
create policy writers_read on public.writers for select using (true);
create policy writers_write
  on public.writers for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Do not expose writer email addresses through the public Data API.
revoke select on table public.writers from anon, authenticated, public;
revoke select (email) on table public.writers from anon, authenticated, public;
grant select (id, name, slug, bio, photo_url, managed_by_desk, created_at)
  on table public.writers to anon, authenticated;
grant insert, update, delete on table public.writers to authenticated;
grant all privileges on table public.writers to service_role;

drop policy if exists news_sources_read on public.news_sources;
drop policy if exists news_sources_write on public.news_sources;
drop policy if exists news_sources_staff_all on public.news_sources;
create policy news_sources_staff_all
  on public.news_sources for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_stories_all on public.desk_stories;
drop policy if exists desk_stories_staff_all on public.desk_stories;
create policy desk_stories_staff_all
  on public.desk_stories for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_story_sources_all on public.desk_story_sources;
drop policy if exists desk_story_sources_staff_all on public.desk_story_sources;
create policy desk_story_sources_staff_all
  on public.desk_story_sources for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_jobs_all on public.desk_jobs;
drop policy if exists desk_jobs_staff_all on public.desk_jobs;
create policy desk_jobs_staff_all
  on public.desk_jobs for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_settings_all on public.desk_settings;
drop policy if exists desk_settings_staff_all on public.desk_settings;
create policy desk_settings_staff_all
  on public.desk_settings for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_source_claims_all on public.desk_source_claims;
drop policy if exists desk_source_claims_staff_all on public.desk_source_claims;
create policy desk_source_claims_staff_all
  on public.desk_source_claims for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_fact_checks_all on public.desk_fact_checks;
drop policy if exists desk_fact_checks_staff_all on public.desk_fact_checks;
create policy desk_fact_checks_staff_all
  on public.desk_fact_checks for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_discovery_hits_all on public.desk_discovery_hits;
drop policy if exists desk_discovery_hits_staff_all on public.desk_discovery_hits;
create policy desk_discovery_hits_staff_all
  on public.desk_discovery_hits for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists desk_story_images_staff_all on public.desk_story_images;
create policy desk_story_images_staff_all
  on public.desk_story_images for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- Internal tables are only accessible to authenticated users with staff RLS approval.
revoke all privileges on table
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
from anon, public;

grant select, insert, update, delete on table
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
to authenticated;

grant all privileges on table
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
to service_role;


insert into public.desk_settings (key, value)
values
  ('ingest_interval_minutes', '30'::jsonb),
  ('style_rules', '{"tone":"neutral","language":"bn-BD","max_adjectives":"low","no_fabricated_facts":true}'::jsonb),
  ('card_template', '{"ratio":"4:5","brand":"The Connect"}'::jsonb),
  ('category_auto_publish', '{}'::jsonb)
on conflict (key) do nothing;

insert into public.desk_settings (key, value)
values
  ('card_template', '{"brand":"The Connect","ratio":"4:5","accent":"#9B1D1F","background":"#F6F1E8","text":"#16110C","logoUrl":"/logo.png"}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.news_sources (
  name, homepage_url, rss_url, category_slug, active,
  trust_level, priority, notes, source_kind, discovery_mode, access_status
)
values
  (
    'BBC Bangla',
    'https://www.bbc.com/bengali',
    'https://feeds.bbci.co.uk/bengali/rss.xml',
    'international',
    true, 5, 10, null, 'international', 'rss', 'ok'
  ),
  (
    'DW Bangla',
    'https://www.dw.com/bn',
    'https://rss.dw.com/rdf/rss-ben-all',
    'international',
    true, 5, 20, null, 'international', 'rss', 'ok'
  ),
  (
    'Prothom Alo',
    'https://www.prothomalo.com',
    'https://www.prothomalo.com/feed/',
    'national',
    true, 4, 30, null, 'major_news', 'rss', 'ok'
  ),
  (
    'bdnews24',
    'https://bangla.bdnews24.com',
    'https://bangla.bdnews24.com/bangladesh/?getXmlFeed=true&widgetId=1211&widgetName=rssfeed',
    'national',
    true, 3, 35,
    'RSS access may be blocked by Cloudflare; keep as discovery/blocked source until confirmed.',
    'major_news', 'blocked', 'access_denied'
  ),
  (
    'Bangladesh Sangbad Sangstha (BSS)',
    'https://www.bssnews.net/bangla/',
    null,
    'national',
    true, 5, 25,
    'National news agency. No public official RSS/API found. Discovery-only until a feed is published.',
    'news_agency', 'manual', 'no_feed'
  ),
  ('Jago News 24','https://www.jagonews24.com','https://www.jagonews24.com/rss/rss.xml','national',true,4,40,'Primary Bangla national feed.','major_news','rss','ok'),
  ('Kaler Kantho','https://www.kalerkantho.com','https://www.kalerkantho.com/rss.xml','national',true,4,50,'Primary Bangla national feed.','major_news','rss','ok'),
  ('Jugantor','https://www.jugantor.com','https://www.jugantor.com/feed/rss.xml','national',true,4,60,'Primary Bangla national feed.','major_news','rss','ok'),
  ('Bangla News 24','https://www.banglanews24.com','https://www.banglanews24.com/rss/rss.xml','national',true,4,70,'Primary Bangla national feed.','major_news','rss','ok'),
  ('Bangla Tribune','https://www.banglatribune.com','https://www.banglatribune.com/feed','national',true,4,80,'Primary Bangla national feed.','major_news','rss','ok'),
  ('The Daily Star','https://www.thedailystar.net','https://www.thedailystar.net/frontpage/rss.xml','national',true,5,90,'High-trust English Bangladesh feed.','major_news','rss','ok'),
  ('Dhaka Tribune','https://www.dhakatribune.com','https://www.dhakatribune.com/rss/home','national',true,5,100,'High-trust English Bangladesh feed.','major_news','rss','ok'),
  ('RisingBD','https://www.risingbd.com','https://www.risingbd.com/rss/rss.xml','national',true,4,110,'Broad Bangla breaking-news feed.','major_news','rss','ok'),
  ('BD24Live','https://www.bd24live.com','https://www.bd24live.com/bangla/feed','national',true,3,120,'Additional high-volume Bangla feed; ranking will control low-value items.','major_news','rss','ok'),
  ('Daily Bangladesh','https://www.daily-bangladesh.com','https://www.daily-bangladesh.com/rss/rss.xml','national',true,3,130,'Additional Bangla feed.','major_news','rss','ok'),
  ('Bangladesh Diplomat','https://bangladeshdiplomat.com','https://bangladeshdiplomat.com/feed','international',true,3,140,'Useful for diplomacy and foreign affairs.','specialist','rss','ok'),
  ('Energy Bangla','https://energybangla.com','https://energybangla.com/feed','economy',true,4,150,'Specialist source for energy, power and environment.','specialist','rss','ok')
on conflict (name) do update
set homepage_url = excluded.homepage_url,
    rss_url = excluded.rss_url,
    category_slug = excluded.category_slug,
    active = excluded.active,
    trust_level = excluded.trust_level,
    priority = excluded.priority,
    notes = excluded.notes,
    source_kind = excluded.source_kind,
    discovery_mode = excluded.discovery_mode,
    access_status = excluded.access_status,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Demo / sample content
-- ---------------------------------------------------------------------------
-- These rows intentionally mirror the original application's demo content so
-- the rebuilt site is immediately understandable. They are published demo
-- articles, not live reporting.

insert into public.articles (
  title, slug, excerpt, body, category_slug, tags, author_name,
  is_lead, is_featured, status, published_at
)
values
(
  'অর্থনীতিতে গতি ফেরাতে নতুন পদক্ষেপ ঘোষণা',
  'orthonitite-goti-ferate-notun-podokkhep',
  'রপ্তানি বাড়াতে ও মূল্যস্ফীতি নিয়ন্ত্রণে একগুচ্ছ সিদ্ধান্তের কথা জানিয়েছে সংশ্লিষ্ট কর্তৃপক্ষ।',
  E'রপ্তানি খাতে গতি ফেরাতে এবং মূল্যস্ফীতি নিয়ন্ত্রণে রাখতে নতুন কয়েকটি পদক্ষেপের কথা জানানো হয়েছে।\n\nবিশ্লেষকরা বলছেন, স্বল্পমেয়াদে এর প্রভাব সীমিত হলেও দীর্ঘমেয়াদে বিনিয়োগে আস্থা ফিরতে পারে। ছোট ও মাঝারি উদ্যোক্তাদের জন্য সহজ শর্তে ঋণের ব্যবস্থা রাখার কথাও বলা হয়েছে।\n\nসংশ্লিষ্টরা মনে করছেন, বাস্তবায়নই হবে আসল চ্যালেঞ্জ।',
  'economy',
  '{"অর্থনীতি","রপ্তানি"}',
  'নিজস্ব প্রতিবেদক',
  true, true, 'published', now() - interval '2 hours'
),
(
  'রাজধানীতে যানজট কমাতে নতুন পরিকল্পনা',
  'rajdhanite-janjot-komate-notun-porikolpona',
  'নগর পরিবহন ব্যবস্থাপনায় পরিবর্তন এনে যানজট কমানোর উদ্যোগ নেওয়া হচ্ছে।',
  E'নগর পরিবহন ব্যবস্থাপনায় ধাপে ধাপে পরিবর্তন এনে যানজট কমানোর পরিকল্পনার কথা জানানো হয়েছে।\n\nপরিকল্পনায় গণপরিবহনকে অগ্রাধিকার দেওয়া, নির্দিষ্ট লেন চালু এবং সিগন্যাল ব্যবস্থার আধুনিকায়নের কথা রয়েছে।',
  'national',
  '{"ঢাকা","পরিবহন"}',
  'নিজস্ব প্রতিবেদক',
  false, true, 'published', now() - interval '5 hours'
),
(
  'সিরিজ জয়ের সুযোগ সামনে, প্রস্তুত দল',
  'series-joyer-sujog-samne-prostut-dol',
  'শেষ ম্যাচে জিতলেই সিরিজ, আত্মবিশ্বাসী ক্রিকেটাররা।',
  E'শেষ ম্যাচ জিতলেই সিরিজ নিশ্চিত। অনুশীলনে খেলোয়াড়দের মনোভাব ইতিবাচক বলে জানিয়েছেন কোচ।\n\nব্যাটিং লাইনআপে একটি পরিবর্তনের সম্ভাবনা রয়েছে।',
  'sports',
  '{"ক্রিকেট"}',
  'ক্রীড়া প্রতিবেদক',
  false, true, 'published', now() - interval '8 hours'
),
(
  'মতামত: শিক্ষায় বিনিয়োগই ভবিষ্যতের সবচেয়ে নিরাপদ বিনিয়োগ',
  'motamot-shikkhay-biniyog',
  'একটি প্রজন্মের দক্ষতা তৈরি না হলে অর্থনীতির অগ্রগতি টেকসই হয় না।',
  E'শিক্ষা খাতে ব্যয়কে অনেক সময় খরচ হিসেবে দেখা হয়, অথচ এটি আসলে বিনিয়োগ।\n\nদক্ষ জনশক্তি ছাড়া প্রযুক্তিনির্ভর অর্থনীতিতে প্রতিযোগিতা করা কঠিন। শ্রেণিকক্ষের মান, শিক্ষক প্রশিক্ষণ ও গবেষণায় বরাদ্দ—তিনটিই সমান জরুরি।',
  'opinion',
  '{"মতামত","শিক্ষা"}',
  'সম্পাদকীয় বিভাগ',
  false, false, 'published', now() - interval '1 day'
),
(
  'বিশ্ব রাজনীতিতে নতুন সমীকরণ',
  'bishwa-rajnitite-notun-somikoron',
  'আঞ্চলিক জোটগুলোর মধ্যে সমঝোতার নতুন ইঙ্গিত মিলেছে।',
  E'আঞ্চলিক জোটগুলোর মধ্যে সাম্প্রতিক আলোচনায় সমঝোতার ইঙ্গিত পাওয়া গেছে।\n\nকূটনীতিকরা বলছেন, বাণিজ্য ও নিরাপত্তা—দুই ক্ষেত্রেই এর প্রভাব পড়তে পারে।',
  'international',
  '{"কূটনীতি"}',
  'আন্তর্জাতিক ডেস্ক',
  false, false, 'published', now() - interval '1 day 4 hours'
),
(
  'প্রবাসী আয়ে ইতিবাচক ধারা',
  'probashi-aye-itibachok-dhara',
  'বৈধ পথে রেমিট্যান্স পাঠানোর হার বেড়েছে বলে জানা গেছে।',
  E'বৈধ পথে রেমিট্যান্স পাঠানোর প্রবণতা বেড়েছে। প্রবাসীরা বলছেন, সেবা সহজ হলে এ ধারা আরও বাড়বে।',
  'probash',
  '{"রেমিট্যান্স"}',
  'নিজস্ব প্রতিবেদক',
  false, false, 'published', now() - interval '2 days'
),
(
  'নতুন চলচ্চিত্র ঘিরে দর্শকের আগ্রহ',
  'notun-cholochitro-ghire-agroho',
  'মুক্তির আগেই আলোচনায় নতুন ছবিটি।',
  E'মুক্তির আগেই আলোচনায় এসেছে নতুন ছবিটি। নির্মাতা জানিয়েছেন, গল্পটি সমকালীন বাস্তবতা নিয়ে।',
  'entertainment',
  '{"সিনেমা"}',
  'বিনোদন ডেস্ক',
  false, false, 'published', now() - interval '2 days 6 hours'
),
(
  'স্বাস্থ্যকর জীবনযাপনে ছোট অভ্যাসের বড় প্রভাব',
  'sasthokor-jibonjapon-obhyas',
  'প্রতিদিনের কয়েকটি অভ্যাসই দীর্ঘমেয়াদে পার্থক্য গড়ে দেয়।',
  E'পর্যাপ্ত ঘুম, নিয়মিত হাঁটা এবং পরিমিত খাবার—এই তিনটি অভ্যাসই দীর্ঘমেয়াদে বড় পার্থক্য গড়ে দেয় বলে মনে করেন চিকিৎসকরা।',
  'lifestyle',
  '{"স্বাস্থ্য"}',
  'লাইফস্টাইল ডেস্ক',
  false, false, 'published', now() - interval '3 days'
);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read news images" on storage.objects;
create policy "public read news images"
  on storage.objects for select
  using (bucket_id = 'news-images');

drop policy if exists "staff read news images" on storage.objects;
create policy "staff read news images"
  on storage.objects for select to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));

drop policy if exists "staff upload news images" on storage.objects;
create policy "staff upload news images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images' and public.is_staff(auth.uid()));

drop policy if exists "staff update news images" on storage.objects;
create policy "staff update news images"
  on storage.objects for update to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));

drop policy if exists "staff delete news images" on storage.objects;
create policy "staff delete news images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));

notify pgrst, 'reload schema';

commit;
