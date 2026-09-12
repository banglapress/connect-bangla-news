insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read news images" on storage.objects;
create policy "public read news images"
on storage.objects
for select
using (bucket_id = 'news-images');
