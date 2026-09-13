import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugifyName } from "@/lib/bangla";
import type { ArticleCard } from "@/lib/news.functions";

export type Writer = {
  id?: string;
  name: string;
  slug: string;
  bio: string | null;
  photo_url: string | null;
  email: string | null;
  managed_by_desk: boolean;
};

function publicClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((role: string) => ["admin", "editor", "news_editor", "sub_editor", "reporter"].includes(role));
  if (!ok) throw new Error("শুধু সম্পাদকীয় দল লেখক যোগ করতে পারে");
}

export const listWriters = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase.from("writers").select("id, name, slug, bio, photo_url, email, managed_by_desk").order("name");
  if (!error && data) return data as Writer[];

  const articles = await supabase.from("articles").select("author_name").eq("status", "published").limit(200);
  const names = [...new Set((articles.data ?? []).map((row) => row.author_name).filter(Boolean))];
  return names.map((name) => ({
    name,
    slug: slugifyName(name),
    bio: null,
    photo_url: null,
    email: null,
    managed_by_desk: true,
  })) as Writer[];
});

export const saveWriter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      slug: z.string().optional().default(""),
      bio: z.string().nullable().optional(),
      photo_url: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      managed_by_desk: z.boolean().optional().default(true),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as { supabase: any; userId: string });
    const payload = {
      name: data.name.trim(),
      slug: (data.slug || slugifyName(data.name)).trim(),
      bio: data.bio || null,
      photo_url: data.photo_url || null,
      email: data.email || null,
      managed_by_desk: data.managed_by_desk ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("writers").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id, slug: payload.slug };
    }
    const { data: row, error } = await context.supabase.from("writers").insert(payload).select("id, slug").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id, slug: row.slug };
  });

export const deleteWriter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context as { supabase: any; userId: string });
    const { error } = await context.supabase.from("writers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWriterPage = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const slug = decodeURIComponent(data.slug);
    const supabase = publicClient();
    const writerRes = await supabase.from("writers").select("id, name, slug, bio, photo_url, email, managed_by_desk").eq("slug", slug).maybeSingle();
    const writer = (!writerRes.error ? writerRes.data : null) as Writer | null;

    const published = await supabase
      .from("articles")
      .select("id, title, slug, excerpt, category_slug, image_url, author_name, published_at, is_lead, is_featured, public_id")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(80);

    const rows = (published.data ?? []) as ArticleCard[];
    const articles = writer
      ? rows.filter((row) => row.author_name === writer.name || slugifyName(row.author_name) === slug)
      : rows.filter((row) => slugifyName(row.author_name) === slug);

    const fallbackName = articles[0]?.author_name ?? slug;
    return {
      writer: writer ?? {
        name: fallbackName,
        slug,
        bio: null,
        photo_url: null,
        email: null,
        managed_by_desk: true,
      },
      articles,
    };
  });
