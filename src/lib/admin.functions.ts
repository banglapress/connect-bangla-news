import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { makePublicId } from "@/lib/ids";

const articleInput = z.object({
  title: z.string().min(1, "শিরোনাম দিন"),
  slug: z.string().min(1),
  excerpt: z.string().optional().default(""),
  body: z.string().optional().default(""),
  category_slug: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  image_url: z.string().nullable().default(null),
  image_caption: z.string().nullable().default(null),
  image_urls: z.array(z.string()).optional().default([]),
  content_type: z.enum(["article", "video"]).optional().default("article"),
  youtube_url: z.string().nullable().optional().default(null),
  author_name: z.string().min(1),
  is_lead: z.boolean().optional().default(false),
  is_featured: z.boolean().optional().default(false),
  status: z.enum(["draft", "published"]),
});

async function rolesFromClient(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!error) return (data ?? []).map((r: { role: string }) => r.role);
  const message = String(error.message || "");
  if (!/schema cache|does not exist|could not find the table/i.test(message)) throw new Error(error.message);
  const checks = await Promise.all(
    ["admin", "editor", "news_editor", "sub_editor", "reporter"].map((role) =>
      supabase.rpc("has_role", { _user_id: userId, _role: role }).then((res: any) => ({ role, ok: !!res.data })),
    ),
  );
  const roles = checks.filter((c) => c.ok).map((c) => c.role);
  if (roles.length) return roles;
  throw new Error(error.message);
}

function isStaff(roles: string[]) {
  return roles.some((role) => ["admin", "editor", "news_editor", "sub_editor", "reporter"].includes(role));
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let roles = await rolesFromClient(context.supabase, context.userId);
    if (!isStaff(roles)) {
      const boot = await context.supabase.rpc("ensure_first_admin");
      if (boot.data === true) roles = ["admin"];
    }
    return { roles, isStaff: isStaff(roles) };
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
    const { data: row, error } = await context.supabase.from("articles").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

async function syncDeskStoryPublication(supabase: any, articleId: string, status: "draft" | "published") {
  const { error } = await supabase
    .from("desk_stories")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("article_id", articleId);
  if (error) throw new Error(error.message);
}

async function writeArticle(supabase: any, payload: Record<string, unknown>, id?: string) {
  const full = { ...payload };
  const basic = { ...payload };
  delete basic.image_urls;
  delete basic.content_type;
  delete basic.youtube_url;
  delete basic.public_id;
  if (id) {
    let res = await supabase.from("articles").update(full).eq("id", id).select("id, slug").single();
    if (res.error && /column|schema cache|content_type|image_urls|youtube_url|public_id/i.test(res.error.message)) {
      res = await supabase.from("articles").update(basic).eq("id", id).select("id, slug").single();
    }
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }
  let res = await supabase.from("articles").insert(full).select("id, slug").single();
  if (res.error && /column|schema cache|content_type|image_urls|youtube_url|public_id/i.test(res.error.message)) {
    res = await supabase.from("articles").insert(basic).select("id, slug").single();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const createArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => articleInput.parse(data))
  .handler(async ({ data, context }) => {
    return writeArticle(context.supabase, {
      ...data,
      author_id: context.userId,
      public_id: makePublicId(),
      image_url: data.image_url ?? data.image_urls?.[0] ?? null,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    });
  });

export const updateArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => articleInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...fields } = data;
    const { data: existing } = await context.supabase.from("articles").select("published_at").eq("id", id).maybeSingle();
    const saved = await writeArticle(context.supabase, {
      ...fields,
      image_url: fields.image_url ?? fields.image_urls?.[0] ?? null,
      published_at: fields.status === "published" ? (existing?.published_at ?? new Date().toISOString()) : null,
    }, id);
    await syncDeskStoryPublication(context.supabase, id, fields.status);
    return saved;
  });

export const deleteArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
