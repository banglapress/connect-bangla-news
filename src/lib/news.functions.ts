import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { listCategories } from "@/lib/category.functions";

export type ArticleCard = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category_slug: string;
  image_url: string | null;
  author_name: string;
  published_at: string | null;
  is_lead: boolean;
  is_featured: boolean;
  public_id?: string | null;
  content_type?: string | null;
  youtube_url?: string | null;
  image_urls?: string[] | null;
};

export type ArticleDetail = ArticleCard & {
  body: string;
  tags: string[];
  image_caption: string | null;
};

const CARD_FULL =
  "id, title, slug, excerpt, category_slug, image_url, author_name, published_at, is_lead, is_featured, public_id, content_type, youtube_url, image_urls";
const CARD_BASIC =
  "id, title, slug, excerpt, category_slug, image_url, author_name, published_at, is_lead, is_featured";
const DETAIL_FULL =
  "id, title, slug, excerpt, body, category_slug, tags, image_url, image_caption, author_name, published_at, public_id, content_type, youtube_url, image_urls";
const DETAIL_BASIC =
  "id, title, slug, excerpt, body, category_slug, tags, image_url, image_caption, author_name, published_at";

function publicClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function selectPublished(supabase: ReturnType<typeof publicClient>, extra?: { category?: string }) {
  let query = supabase.from("articles").select(CARD_FULL).eq("status", "published").order("published_at", { ascending: false }).limit(60);
  if (extra?.category) query = query.eq("category_slug", extra.category);
  const full = await query;
  if (!full.error) return (full.data ?? []) as ArticleCard[];
  let fallback = supabase.from("articles").select(CARD_BASIC).eq("status", "published").order("published_at", { ascending: false }).limit(60);
  if (extra?.category) fallback = fallback.eq("category_slug", extra.category);
  const basic = await fallback;
  return (basic.data ?? []) as ArticleCard[];
}

async function findArticle(supabase: ReturnType<typeof publicClient>, rawKey: string) {
  const key = decodeURIComponent(rawKey || "").trim();
  if (!key) return null;

  const byId = await supabase.from("articles").select(DETAIL_FULL).eq("status", "published").eq("public_id", key).maybeSingle();
  if (byId.data) return byId.data as ArticleDetail;

  const bySlugFull = await supabase.from("articles").select(DETAIL_FULL).eq("status", "published").eq("slug", key).maybeSingle();
  if (bySlugFull.data) return bySlugFull.data as ArticleDetail;

  const bySlug = await supabase.from("articles").select(DETAIL_BASIC).eq("status", "published").eq("slug", key).maybeSingle();
  return (bySlug.data as ArticleDetail | null) ?? null;
}

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const articles = await selectPublished(supabase);
  return { articles };
});

export const getCategoryPage = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const slug = decodeURIComponent(data.slug);
    const supabase = publicClient();
    const categories = await listCategories();
    const category = categories.find((c) => c.slug === slug) ?? null;
    const childSlugs = categories.filter((c) => c.parent_id && category?.id && c.parent_id === category.id).map((c) => c.slug);
    const slugs = [slug, ...childSlugs];
    const articles = (await selectPublished(supabase)).filter((a) => slugs.includes(a.category_slug));
    return { category, articles };
  });

export const getArticle = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const article = await findArticle(supabase, data.slug);
    if (!article) return { article: null, related: [] as ArticleCard[], category: null };
    const related = (await selectPublished(supabase, { category: article.category_slug }))
      .filter((row) => row.id !== article.id)
      .slice(0, 5);
    const categories = await listCategories();
    const category = categories.find((c) => c.slug === article.category_slug) ?? null;
    return { article, related, category };
  });

export const searchArticles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ q: z.string().default("") }).parse(data))
  .handler(async ({ data }) => {
    const term = data.q.trim();
    if (!term) return [] as ArticleCard[];
    const escaped = term.replace(/[%,()]/g, " ");
    const supabase = publicClient();
    const full = await supabase
      .from("articles")
      .select(CARD_FULL)
      .eq("status", "published")
      .or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%`)
      .order("published_at", { ascending: false })
      .limit(40);
    if (!full.error) return (full.data ?? []) as ArticleCard[];
    const basic = await supabase
      .from("articles")
      .select(CARD_BASIC)
      .eq("status", "published")
      .or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%`)
      .order("published_at", { ascending: false })
      .limit(40);
    return (basic.data ?? []) as ArticleCard[];
  });
