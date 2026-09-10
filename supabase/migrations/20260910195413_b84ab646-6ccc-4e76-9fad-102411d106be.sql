create type public.app_role as enum ('admin', 'editor');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by all" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','editor'))
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories public read" on public.categories for select using (true);
create policy "admins manage categories" on public.categories for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

insert into public.categories (name, slug, sort_order) values
  ('জাতীয়','national',1),
  ('আন্তর্জাতিক','international',2),
  ('খেলা','sports',3),
  ('অর্থনীতি','economy',4),
  ('বাণিজ্য','business',5),
  ('লাইফস্টাইল','lifestyle',6),
  ('মতামত','opinion',7),
  ('শিক্ষা','education',8),
  ('সংস্কৃতি','culture',9),
  ('প্রবাস','probash',10),
  ('বিনোদন','entertainment',11);

create table public.articles (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_category_idx on public.articles (category_slug, published_at desc);
create index articles_status_idx on public.articles (status, published_at desc);

grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;
grant all on public.articles to service_role;
alter table public.articles enable row level security;
create policy "published articles public read" on public.articles for select using (status = 'published');
create policy "staff read all articles" on public.articles for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "staff insert articles" on public.articles for insert to authenticated
  with check (public.is_staff(auth.uid()));
create policy "staff update articles" on public.articles for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "staff delete articles" on public.articles for delete to authenticated
  using (public.is_staff(auth.uid()));

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at();

insert into public.articles (title, slug, excerpt, body, category_slug, tags, author_name, is_lead, is_featured, status, published_at) values
('অর্থনীতিতে গতি ফেরাতে নতুন পদক্ষেপ ঘোষণা', 'orthonitite-goti-ferate-notun-podokkhep',
 'রপ্তানি বাড়াতে ও মূল্যস্ফীতি নিয়ন্ত্রণে একগুচ্ছ সিদ্ধান্তের কথা জানিয়েছে সংশ্লিষ্ট কর্তৃপক্ষ।',
 E'রপ্তানি খাতে গতি ফেরাতে এবং মূল্যস্ফীতি নিয়ন্ত্রণে রাখতে নতুন কয়েকটি পদক্ষেপের কথা জানানো হয়েছে।\n\nবিশ্লেষকরা বলছেন, স্বল্পমেয়াদে এর প্রভাব সীমিত হলেও দীর্ঘমেয়াদে বিনিয়োগে আস্থা ফিরতে পারে। ছোট ও মাঝারি উদ্যোক্তাদের জন্য সহজ শর্তে ঋণের ব্যবস্থা রাখার কথাও বলা হয়েছে।\n\nসংশ্লিষ্টরা মনে করছেন, বাস্তবায়নই হবে আসল চ্যালেঞ্জ।',
 'economy', '{"অর্থনীতি","রপ্তানি"}', 'নিজস্ব প্রতিবেদক', true, true, 'published', now() - interval '2 hours'),
('রাজধানীতে যানজট কমাতে নতুন পরিকল্পনা', 'rajdhanite-janjot-komate-notun-porikolpona',
 'নগর পরিবহন ব্যবস্থাপনায় পরিবর্তন এনে যানজট কমানোর উদ্যোগ নেওয়া হচ্ছে।',
 E'নগর পরিবহন ব্যবস্থাপনায় ধাপে ধাপে পরিবর্তন এনে যানজট কমানোর পরিকল্পনার কথা জানানো হয়েছে।\n\nপরিকল্পনায় গণপরিবহনকে অগ্রাধিকার দেওয়া, নির্দিষ্ট লেন চালু এবং সিগন্যাল ব্যবস্থার আধুনিকায়নের কথা রয়েছে।',
 'national', '{"ঢাকা","পরিবহন"}', 'নিজস্ব প্রতিবেদক', false, true, 'published', now() - interval '5 hours'),
('সিরিজ জয়ের সুযোগ সামনে, প্রস্তুত দল', 'series-joyer-sujog-samne-prostut-dol',
 'শেষ ম্যাচে জিতলেই সিরিজ, আত্মবিশ্বাসী ক্রিকেটাররা।',
 E'শেষ ম্যাচ জিতলেই সিরিজ নিশ্চিত। অনুশীলনে খেলোয়াড়দের মনোভাব ইতিবাচক বলে জানিয়েছেন কোচ।\n\nব্যাটিং লাইনআপে একটি পরিবর্তনের সম্ভাবনা রয়েছে।',
 'sports', '{"ক্রিকেট"}', 'ক্রীড়া প্রতিবেদক', false, true, 'published', now() - interval '8 hours'),
('মতামত: শিক্ষায় বিনিয়োগই ভবিষ্যতের সবচেয়ে নিরাপদ বিনিয়োগ', 'motamot-shikkhay-biniyog',
 'একটি প্রজন্মের দক্ষতা তৈরি না হলে অর্থনীতির অগ্রগতি টেকসই হয় না।',
 E'শিক্ষা খাতে ব্যয়কে অনেক সময় খরচ হিসেবে দেখা হয়, অথচ এটি আসলে বিনিয়োগ।\n\nদক্ষ জনশক্তি ছাড়া প্রযুক্তিনির্ভর অর্থনীতিতে প্রতিযোগিতা করা কঠিন। শ্রেণিকক্ষের মান, শিক্ষক প্রশিক্ষণ ও গবেষণায় বরাদ্দ—তিনটিই সমান জরুরি।',
 'opinion', '{"মতামত","শিক্ষা"}', 'সম্পাদকীয় বিভাগ', false, false, 'published', now() - interval '1 day'),
('বিশ্ব রাজনীতিতে নতুন সমীকরণ', 'bishwa-rajnitite-notun-somikoron',
 'আঞ্চলিক জোটগুলোর মধ্যে সমঝোতার নতুন ইঙ্গিত মিলেছে।',
 E'আঞ্চলিক জোটগুলোর মধ্যে সাম্প্রতিক আলোচনায় সমঝোতার ইঙ্গিত পাওয়া গেছে।\n\nকূটনীতিকরা বলছেন, বাণিজ্য ও নিরাপত্তা—দুই ক্ষেত্রেই এর প্রভাব পড়তে পারে।',
 'international', '{"কূটনীতি"}', 'আন্তর্জাতিক ডেস্ক', false, false, 'published', now() - interval '1 day 4 hours'),
('প্রবাসী আয়ে ইতিবাচক ধারা', 'probashi-aye-itibachok-dhara',
 'বৈধ পথে রেমিট্যান্স পাঠানোর হার বেড়েছে বলে জানা গেছে।',
 E'বৈধ পথে রেমিট্যান্স পাঠানোর প্রবণতা বেড়েছে। প্রবাসীরা বলছেন, সেবা সহজ হলে এ ধারা আরও বাড়বে।',
 'probash', '{"রেমিট্যান্স"}', 'নিজস্ব প্রতিবেদক', false, false, 'published', now() - interval '2 days'),
('নতুন চলচ্চিত্র ঘিরে দর্শকের আগ্রহ', 'notun-cholochitro-ghire-agroho',
 'মুক্তির আগেই আলোচনায় নতুন ছবিটি।',
 E'মুক্তির আগেই আলোচনায় এসেছে নতুন ছবিটি। নির্মাতা জানিয়েছেন, গল্পটি সমকালীন বাস্তবতা নিয়ে।',
 'entertainment', '{"সিনেমা"}', 'বিনোদন ডেস্ক', false, false, 'published', now() - interval '2 days 6 hours'),
('স্বাস্থ্যকর জীবনযাপনে ছোট অভ্যাসের বড় প্রভাব', 'sasthokor-jibonjapon-obhyas',
 'প্রতিদিনের কয়েকটি অভ্যাসই দীর্ঘমেয়াদে পার্থক্য গড়ে দেয়।',
 E'পর্যাপ্ত ঘুম, নিয়মিত হাঁটা এবং পরিমিত খাবার—এই তিনটি অভ্যাসই দীর্ঘমেয়াদে বড় পার্থক্য গড়ে দেয় বলে মনে করেন চিকিৎসকরা।',
 'lifestyle', '{"স্বাস্থ্য"}', 'লাইফস্টাইল ডেস্ক', false, false, 'published', now() - interval '3 days');

create policy "staff read news images" on storage.objects for select to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));
create policy "staff upload news images" on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images' and public.is_staff(auth.uid()));
create policy "staff update news images" on storage.objects for update to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));
create policy "staff delete news images" on storage.objects for delete to authenticated
  using (bucket_id = 'news-images' and public.is_staff(auth.uid()));