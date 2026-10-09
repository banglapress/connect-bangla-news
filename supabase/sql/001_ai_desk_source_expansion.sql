-- The Connect AI Desk source expansion for the live News Supabase project.
-- Safe to run more than once: updates sources matched by name, inserts missing ones.
begin;

create temporary table ai_desk_source_expansion (
  name text not null,
  homepage_url text,
  rss_url text,
  category_slug text,
  active boolean not null,
  trust_level integer not null,
  priority integer not null,
  notes text,
  source_kind text not null,
  discovery_mode text not null,
  access_status text not null
) on commit drop;

insert into ai_desk_source_expansion
  (name, homepage_url, rss_url, category_slug, active, trust_level, priority, notes, source_kind, discovery_mode, access_status)
values
  ('Jago News 24', 'https://www.jagonews24.com', 'https://www.jagonews24.com/rss/rss.xml', 'national', true, 4, 40, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),
  ('Kaler Kantho', 'https://www.kalerkantho.com', 'https://www.kalerkantho.com/rss.xml', 'national', true, 4, 50, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),
  ('Jugantor', 'https://www.jugantor.com', 'https://www.jugantor.com/feed/rss.xml', 'national', true, 4, 60, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),
  ('Bangla News 24', 'https://www.banglanews24.com', 'https://www.banglanews24.com/rss/rss.xml', 'national', true, 4, 70, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),
  ('Bangla Tribune', 'https://www.banglatribune.com', 'https://www.banglatribune.com/feed', 'national', true, 4, 80, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),
  ('The Daily Star', 'https://www.thedailystar.net', 'https://www.thedailystar.net/frontpage/rss.xml', 'national', true, 5, 90, 'High-trust English Bangladesh feed.', 'major_news', 'rss', 'ok'),
  ('Dhaka Tribune', 'https://www.dhakatribune.com', 'https://www.dhakatribune.com/rss/home', 'national', true, 5, 100, 'High-trust English Bangladesh feed.', 'major_news', 'rss', 'ok'),
  ('RisingBD', 'https://www.risingbd.com', 'https://www.risingbd.com/rss/rss.xml', 'national', true, 4, 110, 'Broad Bangla breaking-news feed.', 'major_news', 'rss', 'ok'),
  ('BD24Live', 'https://www.bd24live.com', 'https://www.bd24live.com/bangla/feed', 'national', true, 3, 120, 'Additional high-volume Bangla feed; ranking will control duplicates/low-value items.', 'major_news', 'rss', 'ok'),
  ('Daily Bangladesh', 'https://www.daily-bangladesh.com', 'https://www.daily-bangladesh.com/rss/rss.xml', 'national', true, 3, 130, 'Additional Bangla feed.', 'major_news', 'rss', 'ok'),
  ('Bangladesh Diplomat', 'https://bangladeshdiplomat.com', 'https://bangladeshdiplomat.com/feed', 'international', true, 3, 140, 'Useful for diplomacy and foreign affairs.', 'specialist', 'rss', 'ok'),
  ('Energy Bangla', 'https://energybangla.com', 'https://energybangla.com/feed', 'economy', true, 4, 150, 'Specialist source for energy, power and environment.', 'specialist', 'rss', 'ok');

-- Update matching source rows first; this does not require a UNIQUE constraint on name.
update public.news_sources as existing
set homepage_url = incoming.homepage_url,
    rss_url = incoming.rss_url,
    category_slug = incoming.category_slug,
    active = incoming.active,
    trust_level = incoming.trust_level,
    priority = incoming.priority,
    notes = incoming.notes,
    source_kind = incoming.source_kind,
    discovery_mode = incoming.discovery_mode,
    access_status = incoming.access_status,
    updated_at = now()
from ai_desk_source_expansion as incoming
where existing.name = incoming.name;

-- Add only sources that do not already exist by name.
insert into public.news_sources
  (name, homepage_url, rss_url, category_slug, active, trust_level, priority, notes, source_kind, discovery_mode, access_status)
select incoming.name, incoming.homepage_url, incoming.rss_url, incoming.category_slug,
       incoming.active, incoming.trust_level, incoming.priority, incoming.notes,
       incoming.source_kind, incoming.discovery_mode, incoming.access_status
from ai_desk_source_expansion as incoming
where not exists (
  select 1 from public.news_sources as existing where existing.name = incoming.name
);

insert into public.desk_settings (key, value)
values
  ('ingest_lookback_hours', '12'::jsonb),
  ('ingest_max_items', '20'::jsonb)
on conflict (key) do update
set value = excluded.value, updated_at = now();

commit;
