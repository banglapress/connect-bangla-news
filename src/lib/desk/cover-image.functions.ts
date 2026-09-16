import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { publicImageUrl } from "@/lib/image";
import { COVER_PROMPT_VERSION, buildCoverPrompt, buildSafeCoverPrompt } from "@/lib/desk/ai/cover-image";
import {
  coverImageConfigured,
  coverImageModelId,
  coverImageModelLabel,
  generateCoverImageBytes,
  readCoverImageProvider,
} from "@/lib/desk/ai/cover-providers";

const generating = new Set<string>();

function cloudinaryFit(url: string | null | undefined, width: number, height: number) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("res.cloudinary.com")) return url;
    parsed.pathname = parsed.pathname.replace(
      "/image/upload/",
      `/image/upload/c_fill,g_auto,w_${width},h_${height},q_auto,f_auto/`,
    );
    return parsed.toString();
  } catch {
    return url;
  }
}

async function uploadBytes(supabase: any, storyId: string, mime: string, bytes: Uint8Array, kind: string) {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || "").trim();
  if (cloud && preset) {
    const form = new FormData();
    form.append("file", `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
    form.append("upload_preset", preset);
    form.append("folder", `news/covers/${kind}`);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
    const json = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } };
    if (res.ok && json.secure_url) return { url: json.secure_url, path: json.public_id || null };
  }
  const path = `covers/${storyId}-${kind}-${Date.now()}.${ext}`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const uploaded = await supabase.storage.from("news-images").upload(path, blob, { contentType: mime, upsert: true });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const { data } = supabase.storage.from("news-images").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Cover image URL was not created");
  return { url: data.publicUrl, path };
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

function listPayload(story: any, article: any, images: any[], extras?: { migrationNeeded?: boolean; generatingFlag?: boolean }) {
  const reusable = [
    ...(article?.image_urls || []).map((url: string) => ({ url, source_type: "uploaded" })),
    ...(images || []).filter((row: any) => row.image_url && row.generation_status === "ok").map((row: any) => ({ url: row.image_url, source_type: row.source_type, id: row.id })),
  ];
  const seen = new Set<string>();
  return {
    configured: coverImageConfigured(),
    provider: readCoverImageProvider(),
    model: coverImageModelId(),
    modelLabel: coverImageModelLabel(),
    articleId: story.article_id,
    articleImageUrl: article?.image_url || null,
    hasManualImage: Boolean(article?.image_url && !story.cover_image_url),
    selectedId: story.cover_image_id || null,
    images,
    reusable: reusable.filter((row) => row.url && !seen.has(row.url) && seen.add(row.url)),
    generating: Boolean(extras?.generatingFlag) || generating.has(story.id) || story.cover_status === "generating",
    migrationNeeded: extras?.migrationNeeded === true,
  };
}

export const listDeskCoverImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    const images = await context.supabase.from("desk_story_images").select("*").eq("story_id", data.id).order("created_at", { ascending: false });
    if (images.error && /relation|schema cache|desk_story_images/i.test(images.error.message)) {
      return listPayload(story, article, [], { migrationNeeded: true });
    }
    if (images.error) throw new Error(images.error.message);
    return listPayload(story, article, images.data || []);
  });

export const generateDeskCoverImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const provider = readCoverImageProvider();
    if (!coverImageConfigured()) {
      throw new Error(
        provider === "gemini"
          ? "GEMINI_API_KEY is not configured"
          : "Cloudflare cover credentials missing: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
      );
    }
    if (generating.has(data.id)) throw new Error("Cover generation is already running for this story");
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    const headline = article?.title || story.draft_title || story.title_hint || "";
    const body = article?.body || story.draft_body || "";
    const excerpt = article?.excerpt || story.draft_excerpt || "";
    if (!headline.trim() && !body.trim() && !excerpt.trim()) throw new Error("Generate the article first so the cover can use article content");
    generating.add(data.id);
    const pending = await context.supabase.from("desk_story_images").insert({
      story_id: data.id,
      article_id: story.article_id,
      provider,
      model: coverImageModelId(),
      prompt_version: COVER_PROMPT_VERSION,
      source_type: "generated",
      aspect_ratio: "16:9",
      generation_status: "generating",
    }).select("*").maybeSingle();
    await context.supabase.from("desk_stories").update({ cover_status: "generating", updated_at: new Date().toISOString() }).eq("id", data.id);
    const rowId = pending.data?.id as string | undefined;
    const packet = story.research_packet || {};
    const structured = packet.structured || packet;
    const prompt = buildCoverPrompt({
      headline,
      excerpt,
      body,
      category: article?.category_slug || story.category_slug || "",
      tags: article?.tags || story.tags || [],
      facts: (structured.key_facts || []).map((row: any) => (typeof row === "string" ? row : row?.text || "")).filter(Boolean),
      places: (structured.places || []).map((row: any) => (typeof row === "string" ? row : row?.name || "")).filter(Boolean),
      organisations: (structured.organisations || []).map((row: any) => (typeof row === "string" ? row : row?.name || "")).filter(Boolean),
      entities: (structured.entities || []).map((row: any) => (typeof row === "string" ? row : row?.name || "")).filter(Boolean),
    });
    const started = Date.now();
    try {
      const image = await generateCoverImageBytes(prompt, buildSafeCoverPrompt({
        headline,
        excerpt,
        body,
        category: article?.category_slug || story.category_slug || "",
        tags: article?.tags || story.tags || [],
        places: (structured.places || []).map((row: any) => (typeof row === "string" ? row : row?.name || "")).filter(Boolean),
      }));
      const uploaded = await uploadBytes(context.supabase, data.id, image.mime, Buffer.from(image.base64, "base64"), "base");
      const websiteUrl = cloudinaryFit(uploaded.url, 1600, 900) || uploaded.url;
      const socialUrl = cloudinaryFit(uploaded.url, 1080, 1350) || uploaded.url;
      if (rowId) {
        await context.supabase.from("desk_story_images").update({
          provider: image.provider,
          model: image.model,
          prompt_text: prompt.slice(0, 4000),
          visual_concept: image.textNote,
          image_url: websiteUrl,
          social_image_url: socialUrl,
          storage_path: uploaded.path,
          generation_status: "ok",
          duration_ms: image.durationMs,
          updated_at: new Date().toISOString(),
        }).eq("id", rowId);
      }
      await context.supabase.from("desk_stories").update({ cover_status: "ready", cover_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", data.id);
      console.info("[cover-image]", { storyId: data.id, provider: image.provider, model: image.model, durationMs: Date.now() - started, aspectRatio: "16:9", status: "ok" });
      return { ok: true, id: rowId, imageUrl: websiteUrl, socialImageUrl: socialUrl, model: image.model, provider: image.provider, modelLabel: coverImageModelLabel() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cover image generation failed";
      if (rowId) await context.supabase.from("desk_story_images").update({ generation_status: "error", error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", rowId);
      await context.supabase.from("desk_stories").update({ cover_status: "error", updated_at: new Date().toISOString() }).eq("id", data.id);
      console.info("[cover-image]", { storyId: data.id, provider, model: coverImageModelId(), durationMs: Date.now() - started, status: "error" });
      throw new Error(message);
    } finally {
      generating.delete(data.id);
    }
  });

export const selectDeskCoverImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    id: z.string().uuid(),
    imageId: z.string().uuid().optional(),
    imageUrl: z.string().url().optional(),
    socialImageUrl: z.string().url().optional(),
    composedDataUrl: z.string().optional(),
    composedSocialDataUrl: z.string().optional(),
    replaceExisting: z.boolean().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    if (article?.image_url && !data.replaceExisting && !story.cover_image_url) {
      throw new Error("This draft already has a featured image. Confirm replaceExisting to use the AI cover.");
    }
    let imageUrl = data.imageUrl || null;
    let socialUrl = data.socialImageUrl || null;
    if (data.composedDataUrl) {
      const match = data.composedDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || !match[1] || !match[2]) throw new Error("Composed cover must be a JPEG or PNG data URL");
      const uploaded = await uploadBytes(context.supabase, data.id, match[1], Buffer.from(match[2], "base64"), "composed");
      imageUrl = cloudinaryFit(uploaded.url, 1600, 900) || uploaded.url;
      socialUrl = cloudinaryFit(uploaded.url, 1080, 1350) || uploaded.url;
    }
    if (data.composedSocialDataUrl) {
      const match = data.composedSocialDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!match || !match[1] || !match[2]) throw new Error("Social cover must be a JPEG or PNG data URL");
      const uploaded = await uploadBytes(context.supabase, data.id, match[1], Buffer.from(match[2], "base64"), "social");
      socialUrl = uploaded.url;
    }
    if (!imageUrl) throw new Error("No cover image URL to apply");
    if (data.imageId) {
      await context.supabase.from("desk_story_images").update({ is_selected: false }).eq("story_id", data.id);
      await context.supabase.from("desk_story_images").update({ is_selected: true, image_url: imageUrl, social_image_url: socialUrl, updated_at: new Date().toISOString() }).eq("id", data.imageId);
    }
    await context.supabase.from("desk_stories").update({
      cover_image_id: data.imageId || story.cover_image_id,
      cover_image_url: imageUrl,
      cover_social_url: socialUrl,
      cover_status: "selected",
      card_image_url: socialUrl || imageUrl,
      card_ratio: "4:5",
      card_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (story.article_id) {
      const existingUrls: string[] = Array.isArray(article?.image_urls) ? article.image_urls : [];
      await context.supabase.from("articles").update({ image_url: imageUrl, image_urls: [imageUrl, ...existingUrls.filter((url: string) => url !== imageUrl)] }).eq("id", story.article_id);
    }
    return { ok: true, imageUrl, socialUrl };
  });

export const reuseDeskCoverImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), imageUrl: z.string().url(), replaceExisting: z.boolean().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    if (article?.image_url && !data.replaceExisting && !story.cover_image_url) {
      throw new Error("This draft already has a featured image. Confirm replaceExisting to reuse another image.");
    }
    const websiteUrl = cloudinaryFit(data.imageUrl, 1600, 900) || data.imageUrl;
    const socialUrl = cloudinaryFit(data.imageUrl, 1080, 1350) || data.imageUrl;
    const inserted = await context.supabase.from("desk_story_images").insert({
      story_id: data.id,
      article_id: story.article_id,
      provider: "library",
      source_type: "reused",
      aspect_ratio: "16:9",
      image_url: websiteUrl,
      social_image_url: socialUrl,
      is_selected: true,
      generation_status: "ok",
    }).select("id").maybeSingle();
    await context.supabase.from("desk_story_images").update({ is_selected: false }).eq("story_id", data.id);
    if (inserted.data?.id) await context.supabase.from("desk_story_images").update({ is_selected: true }).eq("id", inserted.data.id);
    await context.supabase.from("desk_stories").update({
      cover_image_id: inserted.data?.id || null,
      cover_image_url: websiteUrl,
      cover_social_url: socialUrl,
      cover_status: "selected",
      card_image_url: socialUrl,
      card_ratio: "4:5",
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (story.article_id) {
      const existingUrls: string[] = Array.isArray(article?.image_urls) ? article.image_urls : [];
      await context.supabase.from("articles").update({ image_url: websiteUrl, image_urls: [websiteUrl, ...existingUrls.filter((url: string) => url !== websiteUrl)] }).eq("id", story.article_id);
    }
    return { ok: true, imageUrl: websiteUrl, socialUrl };
  });

export const resolveDeskStoryForArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ articleId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const found = await context.supabase.from("desk_stories").select("id, article_id, draft_title, draft_body").eq("article_id", data.articleId).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    return { storyId: found.data?.id || null };
  });

export function facebookImageFromStory(story: any, article: any) {
  return publicImageUrl(story.cover_social_url) || story.cover_social_url || publicImageUrl(story.cover_image_url) || story.cover_image_url || publicImageUrl(story.card_image_url) || story.card_image_url || publicImageUrl(article?.image_url) || article?.image_url || null;
}
