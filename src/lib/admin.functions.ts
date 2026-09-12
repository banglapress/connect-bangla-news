import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const articleInput = z.object({
  title: z.string().min(1, "শিরোনাম দিন"),
  slug: z.string().min(1),
  excerpt: z.string().optional().default(""),
  body: z.string().optional().default(""),
  category_slug: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  image_url: z.string().nullable().default(null),
  image_caption: z.string().nullable().default(null),
  author_name: z.string().min(1),
  is_lead: z.boolean().optional().default(false),
  is_featured: z.boolean().optional().default(false),
  status: z.enum(["draft", "published"]),
});

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return { roles, isStaff: roles.includes("admin") || roles.includes("editor") };
  });

export const listAllArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("articles")
      .select("id, title, slug, category_slug, status, published_at, updated_at, author_name")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getArticleForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("articles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => articleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("articles")
      .insert({
        ...data,
        author_id: context.userId,
        published_at: data.status === "published" ? new Date().toISOString() : null,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => articleInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const { data: existing } = await context.supabase
      .from("articles")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("articles")
      .update({
        ...fields,
        published_at:
          fields.status === "published"
            ? (existing?.published_at ?? new Date().toISOString())
            : null,
      })
      .eq("id", id)
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
