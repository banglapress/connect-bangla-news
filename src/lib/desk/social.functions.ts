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
import { facebookImageFromStory } from "@/lib/desk/cover-image.functions";

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
