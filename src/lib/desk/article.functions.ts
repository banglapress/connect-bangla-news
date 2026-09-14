import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { getArticleProvider, validateGeneratedArticle } from "@/lib/desk/ai";
import type { ResearchPacket, SourcePacket, StructuredResearch } from "@/lib/desk/ai";
import { makePublicId } from "@/lib/ids";
import { slugifyBangla } from "@/lib/bangla";

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function structuredFrom(packet: any): StructuredResearch | ResearchPacket | null {
  if (!packet) return null;
  if (packet.structured) return packet.structured as StructuredResearch;
  if (packet.key_facts) return packet as StructuredResearch;
  return packet as ResearchPacket;
}

export const generateDeskArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    const storyRes = await supabase.from("desk_stories").select("*").eq("id", data.id).single();
    if (storyRes.error) throw new Error(storyRes.error.message);
    const story = storyRes.data;
    const srcRes = await supabase.from("desk_story_sources").select("*").eq("story_id", data.id);
    const rows = srcRes.data ?? [];
    if (rows.length < 1) throw new Error("Add sources before generating an article");
    const packet = structuredFrom(story.research_packet);
    if (!packet) throw new Error("Prepare Research first");

    const names = await supabase.from("news_sources").select("id, name");
    const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
    const sources: SourcePacket[] = rows.map((row: any) => ({
      sourceRowId: row.id,
      sourceId: row.source_id,
      sourceName: nameById.get(row.source_id) || hostnameOf(row.url) || "Source",
      title: row.title || "",
      url: row.url,
      excerpt: row.excerpt || row.raw_text || "",
      publishedAt: row.published_at || null,
      origin: row.origin || null,
      trusted: row.trusted === true,
      domain: hostnameOf(row.url),
    }));

    await supabase.from("desk_stories").update({
      article_status: "generating",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);

    const provider = getArticleProvider();
    try {
      const drafted = await provider.generateArticle({
        title: story.title_hint || "",
        categorySlug: story.category_slug || "national",
        research: packet,
        sources,
      });
      const checked = validateGeneratedArticle({
        article: drafted,
        research: packet,
        sources,
      });
      drafted.article_status = checked.article_status;
      drafted.warnings = checked.warnings;

      const payload = {
        title: drafted.title,
        slug: drafted.slug || slugifyBangla(drafted.title),
        excerpt: drafted.excerpt,
        body: drafted.body,
        category_slug: drafted.category || story.category_slug || "national",
        tags: drafted.tags,
        image_url: null,
        image_caption: null,
        image_urls: [],
        content_type: "article",
        youtube_url: null,
        author_name: "নিজস্ব প্রতিবেদক",
        author_id: context.userId,
        public_id: makePublicId(),
        is_lead: false,
        is_featured: false,
        status: "draft",
        published_at: null,
      };

      let articleId = story.article_id as string | null;
      if (articleId) {
        const existing = await supabase.from("articles").select("id, status").eq("id", articleId).maybeSingle();
        if (existing.data) {
          const update = await supabase.from("articles").update({
            title: payload.title,
            slug: payload.slug,
            excerpt: payload.excerpt,
            body: payload.body,
            category_slug: payload.category_slug,
            tags: payload.tags,
            status: "draft",
          }).eq("id", articleId);
          if (update.error) throw new Error(update.error.message);
        } else {
          articleId = null;
        }
      }
      if (!articleId) {
        let inserted = await supabase.from("articles").insert(payload).select("id, slug").single();
        if (inserted.error && /column|schema cache|content_type|image_urls|youtube_url|public_id/i.test(inserted.error.message)) {
          const basic = { ...payload } as any;
          delete basic.image_urls;
          delete basic.content_type;
          delete basic.youtube_url;
          delete basic.public_id;
          inserted = await supabase.from("articles").insert(basic).select("id, slug").single();
        }
        if (inserted.error) throw new Error(inserted.error.message);
        articleId = inserted.data.id;
      }

      const storyCore: Record<string, unknown> = {
        article_id: articleId,
        draft_title: drafted.title,
        draft_excerpt: drafted.excerpt,
        draft_body: drafted.body,
        seo_title: drafted.seo_title,
        meta_description: drafted.meta_description,
        tags: drafted.tags,
        status: "draft",
        warning: drafted.warnings[0]?.message || story.warning || null,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      const savedStory = await supabase.from("desk_stories").update({
        ...storyCore,
        article_status: drafted.article_status,
        article_model: drafted.model,
        article_generated_at: drafted.generatedAt,
        article_warnings: drafted.warnings,
      }).eq("id", data.id);
      if (savedStory.error && /column|schema cache|article_/i.test(savedStory.error.message)) {
        const fallback = await supabase.from("desk_stories").update(storyCore).eq("id", data.id);
        if (fallback.error) throw new Error(fallback.error.message);
      } else if (savedStory.error) {
        throw new Error(savedStory.error.message);
      }

      await supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "article",
        status: drafted.article_status === "failed" ? "failed" : "ok",
        payload: {
          provider: drafted.provider,
          model: drafted.model,
          articleId,
          article_status: drafted.article_status,
          inputTokens: drafted.usage?.inputTokens ?? null,
          outputTokens: drafted.usage?.outputTokens ?? null,
          durationMs: drafted.usage?.durationMs ?? null,
        },
        finished_at: new Date().toISOString(),
      });

      return {
        ok: true,
        articleId,
        draftPath: `/admin/${articleId}/edit`,
        article: drafted,
        validation: checked,
        provider: drafted.provider,
        model: drafted.model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Article generation failed";
      await supabase.from("desk_stories").update({
        article_status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      await supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "article",
        status: "failed",
        error: message,
        payload: { provider: "gemini" },
        finished_at: new Date().toISOString(),
      });
      throw new Error(message);
    }
  });

export function researchPacketOf(story: { research_packet?: unknown }) {
  return story.research_packet as ResearchPacket | null;
}
