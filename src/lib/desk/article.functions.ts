import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { getArticleProvider, parseArticleDepth, validateGeneratedArticle } from "@/lib/desk/ai";
import type { ResearchPacket, StructuredResearch } from "@/lib/desk/ai";
import { toSourcePackets } from "@/lib/desk/research.functions";
import { heuristicProvider } from "@/lib/desk/ai/heuristic";
import { makePublicId } from "@/lib/ids";
import { slugifyBangla } from "@/lib/bangla";

function structuredFrom(packet: any): StructuredResearch | ResearchPacket | null {
  if (!packet) return null;
  if (packet.structured) return packet.structured as StructuredResearch;
  if (packet.key_facts) return packet as StructuredResearch;
  return packet as ResearchPacket;
}

export const generateDeskArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        depth: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    const storyRes = await supabase.from("desk_stories").select("*").eq("id", data.id).single();
    if (storyRes.error) throw new Error(storyRes.error.message);
    const story = storyRes.data;
    const srcRes = await supabase.from("desk_story_sources").select("*").eq("story_id", data.id);
    const rows = srcRes.data ?? [];
    if (rows.length < 1) throw new Error("Add sources before generating an article");
    const names = await supabase.from("news_sources").select("id, name");
    const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
    const sources = toSourcePackets(rows, nameById);
    const editorialType = story.editorial_type === "feature" || story.editorial_type === "explainer"
      ? story.editorial_type
      : "news";
    const depth = parseArticleDepth(data.depth || story.article_depth || (editorialType === "news" ? "standard" : "detailed"));

    if (editorialType !== "news") {
      if (rows.length < 2) {
        throw new Error("Feature/Explainer লেখার আগে অন্তত ২টি source story-তে যোগ করুন");
      }
      if (story.angle_status !== "approved" || !story.approved_angle) {
        throw new Error("আগে একটি editorial angle approve করুন");
      }
      if (!story.editorial_outline) {
        throw new Error("আগে editorial outline তৈরি করুন");
      }
    }

    // "Generate AI Article" is the manual escape hatch. It must not depend on
    // the user first running Prepare Research. If no dossier exists, build a
    // deterministic local dossier from the already attached source material,
    // then let Gemini do the actual article writing.
    let packet = structuredFrom(story.research_packet);
    if (!packet) {
      const localResearch = await heuristicProvider.generateResearch({
        title: story.title_hint || "",
        excerpt: rows.map((row: any) => row.excerpt || row.title || "").join(" "),
        sources,
      });
      localResearch.warnings.push({
        code: "research_fallback",
        message: "Research was prepared automatically from the attached sources before article generation.",
      });
      packet = localResearch;

      const researchPacket = {
        ...localResearch,
        source_utilization: story.source_utilization || [],
      };
      await supabase
        .from("desk_stories")
        .update({
          research_status: "needs_review",
          research_packet: researchPacket,
          confirmed_facts: localResearch.key_facts.map((row) => row.text),
          unverified_claims: localResearch.unverified_claims.map((row) => row.text),
          conflicting_facts: localResearch.source_conflicts.map((row) => row.text),
          warning: localResearch.warnings[0]?.message || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    }

    await supabase
      .from("desk_stories")
      .update({
        article_status: "generating",
        article_depth: depth,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    const provider = getArticleProvider();
    try {
      const drafted = await provider.generateArticle({
        title: story.title_hint || "",
        categorySlug: story.category_slug || "national",
        research: packet,
        sources,
        depth,
        editorialType,
        approvedAngle: story.approved_angle,
        editorialBrief: story.editorial_brief,
        editorialOutline: story.editorial_outline,
      });
      const utilization = (packet as StructuredResearch).source_utilization || story.source_utilization || [];
      const checked = validateGeneratedArticle({
        article: drafted,
        research: packet,
        sources,
        utilization,
        depth,
      });
      drafted.article_status = checked.article_status;
      drafted.warnings = checked.warnings;
      drafted.depth = depth;

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
        editorial_type: editorialType,
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
          const update = await supabase
            .from("articles")
            .update({
              title: payload.title,
              slug: payload.slug,
              excerpt: payload.excerpt,
              body: payload.body,
              category_slug: payload.category_slug,
              tags: payload.tags,
              editorial_type: editorialType,
              status: "draft",
            })
            .eq("id", articleId);
          if (update.error) throw new Error(update.error.message);
        } else {
          articleId = null;
        }
      }
      if (!articleId) {
        let inserted = await supabase.from("articles").insert(payload).select("id, slug").single();
        if (inserted.error && /column|schema cache|content_type|editorial_type|image_urls|youtube_url|public_id/i.test(inserted.error.message)) {
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
      const savedStory = await supabase
        .from("desk_stories")
        .update({
          ...storyCore,
          article_status: drafted.article_status,
          article_model: drafted.model,
          article_generated_at: drafted.generatedAt,
          article_warnings: drafted.warnings,
          article_depth: depth,
          article_word_count: checked.metrics?.article_word_count || drafted.word_count || 0,
          article_quality: checked.metrics || null,
        })
        .eq("id", data.id);
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
          depth,
          wordCount: checked.metrics?.article_word_count || drafted.word_count || 0,
          truncated: false,
          inputTokens: drafted.usage?.inputTokens ?? null,
          outputTokens: drafted.usage?.outputTokens ?? null,
          durationMs: drafted.usage?.durationMs ?? null,
          warningCount: drafted.warnings.length,
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
        depth,
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
        payload: { provider: "gemini", depth },
        finished_at: new Date().toISOString(),
      });
      throw new Error(message);
    }
  });

export function researchPacketOf(story: { research_packet?: unknown }) {
  return story.research_packet as ResearchPacket | null;
}
