-- Discovery candidates: snippet/query/status. Does not delete stories or articles.

alter table public.desk_discovery_hits add column if not exists snippet text;
alter table public.desk_discovery_hits add column if not exists query text;
alter table public.desk_discovery_hits add column if not exists status text not null default 'new';

update public.desk_discovery_hits
set status = 'added'
where added is true and status = 'new';

update public.desk_discovery_hits
set status = 'new'
where status is null or status not in ('new', 'added', 'ignored');

delete from public.desk_discovery_hits a
using public.desk_discovery_hits b
where a.story_id = b.story_id
  and a.url = b.url
  and a.created_at > b.created_at;

create unique index if not exists desk_discovery_hits_story_url_uidx
  on public.desk_discovery_hits (story_id, url);
