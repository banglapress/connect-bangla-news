import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];
export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export type ArticleCard = Pick<
  ArticleRow,
  | "id"
  | "title"
  | "slug"
  | "excerpt"
  | "category_slug"
  | "image_url"
  | "author_name"
  | "published_at"
  | "is_lead"
  | "is_featured"
>;

const CARD_COLUMNS =
  "id, title, slug, excerpt, category_slug, image_url, author_name, published_at, is_lead, is_featured";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [categories, articles] = await Promise.all([
    supabase.from("categories").select("id, name, slug, sort_order").order("sort_order"),
    supabase
      .from("articles")
      .select(CARD_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(60),
  ]);

  return {
    categories: (categories.data ?? []) as Pick<
      CategoryRow,
      "id" | "name" | "slug" | "sort_order"
    >[],
    articles: (articles.data ?? []) as ArticleCard[],
  };
});

export const getCategories = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order")
    .order("sort_order");
  return (data ?? []) as Pick<CategoryRow, "id" | "name" | "slug" | "sort_order">[];
});

export const getCategoryPage = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const [category, articles] = await Promise.all([
      supabase.from("categories").select("id, name, slug").eq("slug", data.slug).maybeSingle(),
      supabase
        .from("articles")
        .select(CARD_COLUMNS)
        .eq("status", "published")
        .eq("category_slug", data.slug)
        .order("published_at", { ascending: false })
        .limit(40),
    ]);

    return {
      category: category.data,
      articles: (articles.data ?? []) as ArticleCard[],
    };
  });

export const getArticle = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: article } = await supabase
      .from("articles")
      .select(
        "id, title, slug, excerpt, body, category_slug, tags, image_url, image_caption, author_name, published_at",
      )
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!article) return { article: null, related: [] as ArticleCard[], category: null };

    const [related, category] = await Promise.all([
      supabase
        .from("articles")
        .select(CARD_COLUMNS)
        .eq("status", "published")
        .eq("category_slug", article.category_slug)
        .neq("slug", article.slug)
        .order("published_at", { ascending: false })
        .limit(5),
      supabase.from("categories").select("name, slug").eq("slug", article.category_slug).maybeSingle(),
    ]);

    return {
      article,
      related: (related.data ?? []) as ArticleCard[],
      category: category.data,
    };
  });

export const searchArticles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ q: z.string().default("") }).parse(data))
  .handler(async ({ data }) => {
    const term = data.q.trim();
    if (!term) return [] as ArticleCard[];
    const escaped = term.replace(/[%,()]/g, " ");
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("articles")
      .select(CARD_COLUMNS)
      .eq("status", "published")
      .or(`title.ilike.%${escaped}%,excerpt.ilike.%${escaped}%,body.ilike.%${escaped}%`)
      .order("published_at", { ascending: false })
      .limit(40);
    return (rows ?? []) as ArticleCard[];
  });
