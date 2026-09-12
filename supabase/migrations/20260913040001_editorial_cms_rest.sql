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
      and role::text in ('admin', 'editor', 'news_editor', 'sub_editor', 'reporter')
  )
$$;

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null,
  add column if not exists show_in_nav boolean not null default true,
  add column if not exists nav_order int not null default 0;

update public.categories set nav_order = sort_order where nav_order = 0;

alter table public.articles
  add column if not exists public_id text,
  add column if not exists content_type text not null default 'article',
  add column if not exists youtube_url text,
  add column if not exists image_urls text[] not null default '{}';

update public.articles
set public_id = substr(replace(id::text, '-', ''), 1, 10)
where public_id is null;

do $$ begin
  alter table public.articles add constraint articles_public_id_key unique (public_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.articles add constraint articles_content_type_check
    check (content_type in ('article', 'video'));
exception when duplicate_object then null;
end $$;

update public.articles
set image_urls = array[image_url]
where image_url is not null and (image_urls is null or cardinality(image_urls) = 0);

notify pgrst, 'reload schema';
