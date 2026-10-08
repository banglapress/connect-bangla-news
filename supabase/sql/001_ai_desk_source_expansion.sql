-- The Connect AI Desk source expansion for the live News Supabase project.
-- Safe to run more than once: source rows are keyed by name.
begin;

insert into public.news_sources (
  name, homepage_url, rss_url, category_slug, active,
  trust_level, priority, notes, source_kind, discovery_mode, access_status
)
values
  ('Jago News 24', 'https://www.jagonews24.com', 'https://www.jagonews24.com/rss/rss.xml',
   'national', true, 4, 40, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),

  ('Kaler Kantho', 'https://www.kalerkantho.com', 'https://www.kalerkantho.com/rss.xml',
   'national', true, 4, 50, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),

  ('Jugantor', 'https://www.jugantor.com', 'https://www.jugantor.com/feed/rss.xml',
   'national', true, 4, 60, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),

  ('Bangla News 24', 'https://www.banglanews24.com', 'https://www.banglanews24.com/rss/rss.xml',
   'national', true, 4, 70, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),

  ('Bangla Tribune', 'https://www.banglatribune.com', 'https://www.banglatribune.com/feed',
   'national', true, 4, 80, 'Primary Bangla national feed.', 'major_news', 'rss', 'ok'),

  ('The Daily Star', 'https://www.thedailystar.net', 'https://www.thedailystar.net/frontpage/rss.xml',
   'national', true, 5, 90, 'High-trust English Bangladesh feed.', 'major_news', 'rss', 'ok'),

  ('Dhaka Tribune', 'https://www.dhakatribune.com', 'https://www.dhakatribune.com/rss/home',
   'national', true, 5, 100, 'High-trust English Bangladesh feed.', 'major_news', 'rss', 'ok'),

  ('RisingBD', 'https://www.risingbd.com', 'https://www.risingbd.com/rss/rss.xml',
   'national', true, 4, 110, 'Broad Bangla breaking-news feed.', 'major_news', 'rss', 'ok'),

  ('BD24Live', 'https://www.bd24live.com', 'https://www.bd24live.com/bangla/feed',
   'national', true, 3, 120, 'Additional high-volume Bangla feed; ranking will control duplicates/low-value items.', 'major_news', 'rss', 'ok'),

  ('Daily Bangladesh', 'https://www.daily-bangladesh.com', 'https://www.daily-bangladesh.com/rss/rss.xml',
   'national', true, 3, 130, 'Additional Bangla feed.', 'major_news', 'rss', 'ok'),

  ('Bangladesh Diplomat', 'https://bangladeshdiplomat.com', 'https://bangladeshdiplomat.com/feed',
   'international', true, 3, 140, 'Useful for diplomacy and foreign affairs.', 'specialist', 'rss', 'ok'),

  ('Energy Bangla', 'https://energybangla.com', 'https://energybangla.com/feed',
   'economy', true, 4, 150, 'Specialist source for energy, power and environment.', 'specialist', 'rss', 'ok')
on conflict (name) do update
set homepage_url = excluded.homepage_url,
    rss_url = excluded.rss_url,
    category_slug = excluded.category_slug,
    active = true,
    trust_level = excluded.trust_level,
    priority = excluded.priority,
    notes = excluded.notes,
    source_kind = excluded.source_kind,
    discovery_mode = excluded.discovery_mode,
    access_status = excluded.access_status,
    updated_at = now();

insert into public.desk_settings (key, value)
values
  ('ingest_lookback_hours', '12'::jsonb),
  ('ingest_max_items', '20'::jsonb)
on conflict (key) do update
set value = excluded.value, updated_at = now();

commit;
