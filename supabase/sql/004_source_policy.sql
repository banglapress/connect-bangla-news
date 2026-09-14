-- Source policy: kinds + bdnews24 active + BSS discovery source.
-- Does not delete desk_stories or public articles.

alter table public.news_sources add column if not exists source_kind text not null default 'other';
alter table public.news_sources add column if not exists discovery_mode text not null default 'rss';

update public.news_sources
set source_kind = 'international',
    discovery_mode = 'rss',
    updated_at = now()
where name in ('BBC Bangla', 'DW Bangla');

update public.news_sources
set source_kind = 'major_news',
    discovery_mode = 'rss',
    updated_at = now()
where name in ('Prothom Alo');

update public.news_sources
set name = 'bdnews24',
    homepage_url = 'https://bangla.bdnews24.com',
    rss_url = 'https://bangla.bdnews24.com/bangladesh/?getXmlFeed=true&widgetId=1211&widgetName=rssfeed',
    category_slug = coalesce(category_slug, 'national'),
    active = true,
    source_kind = 'major_news',
    discovery_mode = 'rss',
    trust_level = greatest(trust_level, 3),
    priority = least(priority, 35),
    notes = 'Bangladesh section RSS',
    updated_at = now()
where name ilike '%bdnews24%';

insert into public.news_sources (
  name, homepage_url, rss_url, category_slug, active, trust_level, priority, notes, source_kind, discovery_mode
)
select
  'Bangladesh Sangbad Sangstha (BSS)',
  'https://www.bssnews.net/bangla/',
  null,
  'national',
  true,
  5,
  25,
  'National news agency. No public official RSS/API found. Discovery-only until a feed is published.',
  'news_agency',
  'manual'
where not exists (
  select 1 from public.news_sources s
  where s.name ilike '%Sangbad Sangstha%' or s.name ilike 'BSS%'
);
