-- Run this query alone first.
do $$ begin
  alter type public.app_role add value if not exists 'reporter';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.app_role add value if not exists 'sub_editor';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.app_role add value if not exists 'news_editor';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type public.app_role add value if not exists 'subscriber';
exception when duplicate_object then null;
end $$;
