import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { articlePath, makePublicId } from "@/lib/ids";
import { publicImageUrl } from "@/lib/image";
import { facebookPublicStatus, publishPagePhoto } from "@/lib/desk/facebook";

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

function facebookSiteOrigin() {
  if (typeof process === "undefined") return "";
  return String(
    process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      "",
  ).replace(/\/$/, "");
}

function facebookArticleUrl(article: { public_id?: string | null; slug?: string | null }) {
  const origin = facebookSiteOrigin();
  const path = articlePath(article);
  return origin ? origin + path : path;
}

function facebookCaption(article: {
  title?: string | null;
  excerpt?: string | null;
  tags?: string[] | null;
}) {
  const title = String(article.title || "").trim();
  const lines = title ? [title] : [];
  const excerpt = String(article.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const url = facebookArticleUrl(article);
  if (excerpt && excerpt !== title) lines.push(excerpt);
  if (url) lines.push(url);
  const tags = (article.tags || [])
    .map((tag) => String(tag).replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((tag) => tag.length >= 2)
    .slice(0, 3)
    .map((tag) => "#" + tag);
  if (tags.length) lines.push(tags.join(" "));
  return lines.filter(Boolean).join("\n\n");
}

function facebookArticleImage(story: any, article: any) {
  return (
    publicImageUrl(story?.cover_social_url) ||
    story?.cover_social_url ||
    publicImageUrl(story?.cover_image_url) ||
    story?.cover_image_url ||
    publicImageUrl(story?.card_image_url) ||
    story?.card_image_url ||
    publicImageUrl(article?.image_url) ||
    article?.image_url ||
    null
  );
}

export const getArticleFacebookState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const articleRes = await context.supabase
      .from("articles")
      .select("id,status")
      .eq("id", data.id)
      .maybeSingle();
    if (articleRes.error) throw new Error(articleRes.error.message);
    if (!articleRes.data) {
      return { configured: facebookPublicStatus().configured, status: "not_posted" as const, postId: null, error: null };
    }
    const storyRes = await context.supabase
      .from("desk_stories")
      .select("facebook_status,facebook_post_id,facebook_error")
      .eq("article_id", data.id)
      .maybeSingle();
    if (storyRes.error && !/column|schema cache/i.test(storyRes.error.message)) {
      throw new Error(storyRes.error.message);
    }
    const story = storyRes.data || null;
    return {
      configured: facebookPublicStatus().configured,
      status: story?.facebook_status === "published"
        ? ("published" as const)
        : story?.facebook_status === "failed"
          ? ("failed" as const)
          : ("not_posted" as const),
      postId: story?.facebook_post_id || null,
      error: story?.facebook_error || null,
    };
  });

export const publishArticleToFacebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const articleRes = await context.supabase.from("articles").select("*").eq("id", data.id).single();
    if (articleRes.error) throw new Error(articleRes.error.message);
    const article = articleRes.data;
    if (article.status !== "published") throw new Error("আগে ওয়েবসাইটে খবরটি প্রকাশ করুন");
    if (!facebookPublicStatus().configured) throw new Error("Facebook is not configured. Set META_ACCESS_TOKEN and META_PAGE_ID.");

    const storyRes = await context.supabase.from("desk_stories").select("*").eq("article_id", data.id).maybeSingle();
    if (storyRes.error && !/relation|column|schema cache/i.test(storyRes.error.message)) {
      throw new Error(storyRes.error.message);
    }
    const story = storyRes.data || null;
    if (story?.facebook_status === "published" && story.facebook_post_id) {
      return { ok: true, alreadyPublished: true, postId: story.facebook_post_id };
    }

    const imageUrl = facebookArticleImage(story, article);
    if (!imageUrl) throw new Error("Facebook-এ photo post করতে আগে একটি cover/featured image দিন");
    const caption = String(story?.social_caption || "").trim() || facebookCaption(article);
    if (!caption) throw new Error("Facebook caption তৈরি করা যায়নি");

    try {
      const posted = await publishPagePhoto({ imageUrl, caption });
      if (story?.id) {
        await context.supabase.from("desk_stories").update({
          facebook_status: "published",
          facebook_post_id: posted.postId,
          facebook_published_at: new Date().toISOString(),
          facebook_error: null,
          social_caption: story.social_caption || caption,
          updated_at: new Date().toISOString(),
        }).eq("id", story.id);
        await context.supabase.from("desk_jobs").insert({
          story_id: story.id,
          stage: "facebook",
          status: "ok",
          payload: { postId: posted.postId, photoId: posted.photoId, trigger: "article_publish" },
          finished_at: new Date().toISOString(),
        });
      }
      return { ok: true, alreadyPublished: false, postId: posted.postId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Facebook publish failed";
      if (story?.id) {
        await context.supabase.from("desk_stories").update({
          facebook_status: "failed",
          facebook_error: message,
          social_caption: story.social_caption || caption,
          updated_at: new Date().toISOString(),
        }).eq("id", story.id);
        await context.supabase.from("desk_jobs").insert({
          story_id: story.id,
          stage: "facebook",
          status: "failed",
          error: message,
          payload: { trigger: "article_publish" },
          finished_at: new Date().toISOString(),
        });
      }
      throw new Error(message);
    }
  });
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
