import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { articlePath } from "@/lib/ids";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate } from "@/lib/bangla";
import { publicImageUrl } from "@/lib/image";
import { DEFAULT_GEMINI_MODEL, geminiProvider } from "@/lib/desk/ai/gemini";
import { clipText, parseCardTemplate, type CardRatio } from "@/lib/desk/card/template";
import { facebookPublicStatus, maskPageId, probeFacebookPage, publishPagePhoto, readFacebookSecrets } from "@/lib/desk/facebook";

function siteOrigin() {
  if (typeof process === "undefined") return "";
  return String(
    process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      "",
  ).replace(/\/$/, "");
}

function articlePublicUrl(article: { public_id?: string | null; slug?: string | null } | null) {
  const origin = siteOrigin();
  const path = article ? articlePath(article) : "/";
  return origin ? `${origin}${path}` : path;
}

function bytesFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Card image must be a JPEG or PNG data URL");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1], bytes };
}

async function uploadCardImage(supabase: any, storyId: string, dataUrl: string) {
  const { mime, bytes } = bytesFromDataUrl(dataUrl);
  const ext = mime.includes("png") ? "png" : "jpg";
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || "").trim();
  if (cloud && preset) {
    const form = new FormData();
    form.append("file", dataUrl);
    form.append("upload_preset", preset);
    form.append("folder", "news/cards");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
    const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
    if (res.ok && json.secure_url) return json.secure_url;
  }
  const path = `cards/${storyId}-${Date.now()}.${ext}`;
  const blob = new Blob([bytes], { type: mime });
  const uploaded = await supabase.storage.from("news-images").upload(path, blob, {
    contentType: mime,
    upsert: true,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const { data } = supabase.storage.from("news-images").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Card image URL was not created");
  return data.publicUrl;
}

async function readCardTemplate(supabase: any) {
  const { data } = await supabase.from("desk_settings").select("value").eq("key", "card_template").maybeSingle();
  return parseCardTemplate(data?.value);
}

async function loadStoryBundle(supabase: any, id: string) {
  const storyRes = await supabase.from("desk_stories").select("*").eq("id", id).single();
  if (storyRes.error) throw new Error(storyRes.error.message);
  const story = storyRes.data;
  let article: any = null;
  if (story.article_id) {
    const articleRes = await supabase.from("articles").select("*").eq("id", story.article_id).maybeSingle();
    article = articleRes.data;
  }
  return { story, article };
}

function supportLine(story: any, article: any) {
  return clipText(story.card_support || article?.excerpt || story.draft_excerpt || story.seo_title || "", 140);
}

function headlineOf(story: any, article: any) {
  return clipText(story.card_headline || article?.title || story.draft_title || story.title_hint || "", 110);
}

function fallbackCaption(input: { headline: string; excerpt: string; url: string; tags: string[] }) {
  const lines = [input.headline.trim()];
  const excerpt = clipText(input.excerpt, 180);
  if (excerpt && excerpt !== input.headline) lines.push(excerpt);
  if (input.url) lines.push(input.url);
  const tags = input.tags
    .map((tag) => tag.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((tag) => tag.length >= 2)
    .slice(0, 3)
    .map((tag) => `#${tag}`);
  if (tags.length) lines.push(tags.join(" "));
  return lines.filter(Boolean).join("\n\n");
}

export const getSocialDeskState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    const template = await readCardTemplate(context.supabase);
    const fb = facebookPublicStatus();
    const imageUrl = publicImageUrl(article?.image_url || story.card_image_url) || article?.image_url || null;
    const storedStatus = String(story.facebook_status || "");
    const facebookStatus =
      storedStatus === "published" || storedStatus === "failed"
        ? storedStatus
        : fb.configured
          ? "ready"
          : "not_configured";
    return {
      storyId: story.id,
      articleId: story.article_id,
      articleStatus: article?.status || null,
      headline: headlineOf(story, article),
      support: supportLine(story, article),
      category: categoryName(article?.category_slug || story.category_slug || "national"),
      dateLabel: formatBanglaDate(article?.published_at || story.article_generated_at || story.updated_at),
      photoUrl: imageUrl,
      cardImageUrl: publicImageUrl(story.card_image_url) || story.card_image_url || null,
      cardRatio: (story.card_ratio === "1:1" ? "1:1" : template.ratio) as CardRatio,
      cardGeneratedAt: story.card_generated_at || null,
      caption: story.social_caption || "",
      articleUrl: articlePublicUrl(article),
      template,
      facebook: {
        status: facebookStatus,
        configured: fb.configured,
        pageIdMasked: maskPageId(fb.pageId),
        pageName: story.facebook_page_name || fb.pageName,
        postId: story.facebook_post_id || null,
        publishedAt: story.facebook_published_at || null,
        error: story.facebook_error || null,
      },
    };
  });

export const proxyDeskImage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url().max(800) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    if (!/^https?:\/\//i.test(data.url)) throw new Error("Only http(s) image URLs can be proxied");
    const res = await fetch(data.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Could not fetch featured image (${res.status})`);
    const mime = String(res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) throw new Error("Featured image is not a usable photo");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > 8_000_000) throw new Error("Featured image is too large for a card");
    const safeMime = mime === "image/jpg" ? "image/jpeg" : mime;
    return { dataUrl: `data:${safeMime};base64,${buffer.toString("base64")}` };
  });

export const saveDeskCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        dataUrl: z.string().min(32),
        ratio: z.enum(["1:1", "4:5"]),
        headline: z.string().optional(),
        support: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const url = await uploadCardImage(context.supabase, data.id, data.dataUrl);
    const patch = {
      card_image_url: url,
      card_ratio: data.ratio,
      card_headline: data.headline || null,
      card_support: data.support || null,
      card_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const saved = await context.supabase.from("desk_stories").update(patch).eq("id", data.id);
    if (saved.error && /column|schema cache|card_/i.test(saved.error.message)) {
      const fallback = await context.supabase
        .from("desk_stories")
        .update({
          card_image_url: url,
          card_headline: data.headline || null,
          card_support: data.support || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (fallback.error) throw new Error(fallback.error.message);
    } else if (saved.error) {
      throw new Error(saved.error.message);
    }
    await context.supabase.from("desk_jobs").insert({
      story_id: data.id,
      stage: "card",
      status: "ok",
      payload: { ratio: data.ratio },
      finished_at: new Date().toISOString(),
    });
    return { ok: true, url };
  });

export const generateDeskCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    const headline = headlineOf(story, article);
    const excerpt = String(article?.excerpt || story.draft_excerpt || "");
    const url = articlePublicUrl(article);
    const tags = Array.isArray(article?.tags) ? article.tags : Array.isArray(story.tags) ? story.tags : [];
    let caption = fallbackCaption({ headline, excerpt, url, tags });
    let provider = "heuristic";
    if (geminiProvider.isConfigured()) {
      try {
        const model = geminiProvider.model || DEFAULT_GEMINI_MODEL;
        const result = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": String(process.env.GEMINI_API_KEY || ""),
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: [
                        "Write a short Facebook caption in Bangladesh Bangla for The Connect.",
                        "Neutral, concise, no invented facts, no clickbait.",
                        "Do not copy the article. Include the article URL on its own line.",
                        "Optionally add up to 3 relevant hashtags from the tags.",
                        `Headline: ${headline}`,
                        excerpt ? `Excerpt: ${excerpt.slice(0, 400)}` : "",
                        `URL: ${url}`,
                        tags.length ? `Tags: ${tags.join(", ")}` : "",
                        'Return JSON {"caption":"..."} only.',
                      ]
                        .filter(Boolean)
                        .join("\n"),
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseJsonSchema: {
                  type: "object",
                  properties: { caption: { type: "string" } },
                  required: ["caption"],
                  additionalProperties: false,
                },
              },
            }),
          },
        );
        const raw = await result.text();
        if (result.ok) {
          const payload = JSON.parse(raw);
          const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
          const parsed = text ? JSON.parse(text) : null;
          if (parsed?.caption) {
            caption = String(parsed.caption).trim();
            if (url && !caption.includes(url)) caption = `${caption}\n\n${url}`;
            provider = "gemini";
          }
        }
      } catch {
        provider = "heuristic";
      }
    }
    const saved = await context.supabase
      .from("desk_stories")
      .update({
        social_caption: caption,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true, caption, provider };
  });

export const saveDeskCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), caption: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const saved = await context.supabase
      .from("desk_stories")
      .update({
        social_caption: data.caption,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true };
  });

export const getCardTemplateSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    return readCardTemplate(context.supabase);
  });

export const getFacebookConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const publicStatus = facebookPublicStatus();
    try {
      const live = await probeFacebookPage();
      return {
        ...publicStatus,
        configured: live.ok,
        status: live.status,
        pageName: live.pageName,
        pageIdMasked: maskPageId(readFacebookSecrets().pageId),
      };
    } catch (err) {
      return {
        ...publicStatus,
        configured: publicStatus.configured,
        status: publicStatus.configured ? "ready" : "not_configured",
        error: err instanceof Error ? err.message : "Facebook probe failed",
        pageIdMasked: maskPageId(readFacebookSecrets().pageId),
      };
    }
  });

export const saveCardTemplateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        brand: z.string().min(1).max(80),
        ratio: z.enum(["1:1", "4:5"]),
        accent: z.string().min(4).max(16),
        background: z.string().min(4).max(16),
        text: z.string().min(4).max(16),
        logoUrl: z.string().max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const value = parseCardTemplate(data);
    const saved = await context.supabase.from("desk_settings").upsert({
      key: "card_template",
      value,
      updated_at: new Date().toISOString(),
    });
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true, template: value };
  });

export const publishDeskToFacebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), confirm: z.literal(true) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story } = await loadStoryBundle(context.supabase, data.id);
    if (!facebookPublicStatus().configured) {
      throw new Error("Facebook is not configured. Set META_ACCESS_TOKEN and META_PAGE_ID.");
    }
    if (!story.card_image_url) throw new Error("Generate and save a photo card first");
    if (!String(story.social_caption || "").trim()) throw new Error("Generate or write a caption first");
    if (story.facebook_status === "published" && story.facebook_post_id) {
      throw new Error(`Already published (${story.facebook_post_id}). Will not create a duplicate post.`);
    }
    try {
      const posted = await publishPagePhoto({
        imageUrl: publicImageUrl(story.card_image_url) || story.card_image_url,
        caption: story.social_caption,
      });
      const page = await probeFacebookPage().catch(() => null);
      await context.supabase
        .from("desk_stories")
        .update({
          facebook_status: "published",
          facebook_post_id: posted.postId,
          facebook_published_at: new Date().toISOString(),
          facebook_error: null,
          facebook_page_name: page?.pageName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      await context.supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "facebook",
        status: "ok",
        payload: { postId: posted.postId, photoId: posted.photoId },
        finished_at: new Date().toISOString(),
      });
      return { ok: true, postId: posted.postId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Facebook publish failed";
      await context.supabase
        .from("desk_stories")
        .update({
          facebook_status: "failed",
          facebook_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      await context.supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "facebook",
        status: "failed",
        error: message,
        payload: {},
        finished_at: new Date().toISOString(),
      });
      throw new Error(message);
    }
  });
