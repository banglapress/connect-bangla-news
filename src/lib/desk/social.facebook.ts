import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { publicImageUrl } from "@/lib/image";
import { parseCardTemplate } from "@/lib/desk/card/template";
import { facebookPublicStatus, maskPageId, probeFacebookPage, publishPagePhoto, readFacebookSecrets } from "@/lib/desk/facebook";

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

function publishImageOf(story: any, article: any) {
  return (
    publicImageUrl(story.cover_social_url) ||
    story.cover_social_url ||
    publicImageUrl(story.cover_image_url) ||
    story.cover_image_url ||
    publicImageUrl(story.card_image_url) ||
    story.card_image_url ||
    publicImageUrl(article?.image_url) ||
    article?.image_url ||
    null
  );
}

export const getCardTemplateSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { data } = await context.supabase.from("desk_settings").select("value").eq("key", "card_template").maybeSingle();
    return parseCardTemplate(data?.value);
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
    z.object({
      brand: z.string().min(1).max(80),
      ratio: z.enum(["1:1", "4:5"]),
      accent: z.string().min(4).max(16),
      background: z.string().min(4).max(16),
      text: z.string().min(4).max(16),
      logoUrl: z.string().max(400),
    }).parse(data),
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
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    if (!facebookPublicStatus().configured) {
      throw new Error("Facebook is not configured. Set META_ACCESS_TOKEN and META_PAGE_ID.");
    }
    const publishImage = publishImageOf(story, article);
    if (!publishImage) throw new Error("Select an article cover image or save a photo card first");
    if (!String(story.social_caption || "").trim()) throw new Error("Generate or write a caption first");
    if (story.facebook_status === "published" && story.facebook_post_id) {
      throw new Error(`Already published (${story.facebook_post_id}). Will not create a duplicate post.`);
    }
    try {
      const posted = await publishPagePhoto({
        imageUrl: publishImage,
        caption: story.social_caption,
      });
      const page = await probeFacebookPage().catch(() => null);
      await context.supabase.from("desk_stories").update({
        facebook_status: "published",
        facebook_post_id: posted.postId,
        facebook_published_at: new Date().toISOString(),
        facebook_error: null,
        facebook_page_name: page?.pageName || null,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
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
      await context.supabase.from("desk_stories").update({
        facebook_status: "failed",
        facebook_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
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
