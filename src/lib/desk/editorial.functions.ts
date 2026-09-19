import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { discoverRelatedCoverage } from "@/lib/desk/discovery";
import { toSourcePackets } from "@/lib/desk/research.functions";
import { generateEditorialBrief, generateEditorialOutline } from "@/lib/desk/editorial-ai";

const EDITORIAL_TYPES = ["news", "explainer", "feature"] as const;
type EditorialType = (typeof EDITORIAL_TYPES)[number];

async function loadStoryContext(supabase: any, storyId: string) {
  const storyRes = await supabase.from("desk_stories").select("*").eq("id", storyId).single();
  if (storyRes.error) throw new Error(storyRes.error.message);

  const sourceRes = await supabase.from("desk_story_sources").select("*").eq("story_id", storyId);
  const rows = sourceRes.data ?? [];
  const names = await supabase.from("news_sources").select("id, name");
  const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
  const sources = toSourcePackets(rows, nameById);

  const hitsRes = await supabase
    .from("desk_discovery_hits")
    .select("*")
    .eq("story_id", storyId)
    .neq("status", "ignored")
    .order("relevance", { ascending: false })
    .limit(20);

  return { story: storyRes.data, rows, sources, candidates: hitsRes.data ?? [] };
}

export const createEditorialStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      title: z.string().trim().min(5).max(300),
      editorialType: z.enum(EDITORIAL_TYPES),
      categorySlug: z.string().trim().min(1).max(80).default("national"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const inserted = await context.supabase
      .from("desk_stories")
      .insert({
        title_hint: data.title,
        category_slug: data.categorySlug,
        editorial_type: data.editorialType,
        status: "new",
        source_count: 0,
        angle_status: "pending",
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { ok: true, id: inserted.data.id };
  });

export const setEditorialType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), editorialType: z.enum(EDITORIAL_TYPES) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const update = await context.supabase
      .from("desk_stories")
      .update({
        editorial_type: data.editorialType,
        angle_status: "pending",
        editorial_brief: null,
        approved_angle: null,
        editorial_outline: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (update.error) throw new Error(update.error.message);
    return { ok: true };
  });

export const prepareEditorialBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    const { story, sources, candidates } = await loadStoryContext(supabase, data.id);
    const editorialType: EditorialType = story.editorial_type === "feature" || story.editorial_type === "explainer"
      ? story.editorial_type
      : "explainer";

    let discoveryCandidates = candidates;
    let discoveryDiagnostics: any[] = [];

    if (!discoveryCandidates.length) {
      const result = await discoverRelatedCoverage({
        title: String(story.title_hint || story.draft_title || "").trim(),
        excerpt: sources.map((source) => source.excerpt || source.title || "").join(" "),
        knownUrls: sources.map((source) => source.url),
      });
      discoveryDiagnostics = result.diagnostics;
      discoveryCandidates = result.hits;

      for (const hit of result.hits.slice(0, 16)) {
        await supabase.from("desk_discovery_hits").upsert(
          {
            story_id: data.id,
            provider: hit.provider,
            title: hit.title,
            url: hit.url,
            domain: hit.domain,
            published_at: hit.publishedAt,
            snippet: hit.snippet,
            relevance: hit.relevance,
            query: hit.query,
            status: "new",
            added: false,
            raw: hit,
          },
          { onConflict: "story_id,url", ignoreDuplicates: true },
        );
      }
    }

    if (!sources.length && !discoveryCandidates.length) {
      throw new Error("রিসার্চের জন্য কোনো source বা discovery coverage পাওয়া যায়নি");
    }

    const brief = await generateEditorialBrief({
      title: String(story.title_hint || story.draft_title || "").trim(),
      editorialType,
      sources,
      candidates: discoveryCandidates,
    });

    const saved = await supabase
      .from("desk_stories")
      .update({
        editorial_type: editorialType,
        editorial_brief: {
          ...brief,
          discovery_diagnostics: discoveryDiagnostics,
        },
        angle_status: "ready",
        approved_angle: null,
        editorial_outline: null,
        editorial_provider: brief.provider,
        editorial_model: brief.model,
        editorial_generated_at: brief.generatedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (saved.error) throw new Error(saved.error.message);

    await supabase.from("desk_jobs").insert({
      story_id: data.id,
      stage: "editorial_research",
      status: "ok",
      payload: {
        editorialType,
        provider: brief.provider,
        model: brief.model,
        angleCount: Array.isArray(brief.angle_options) ? brief.angle_options.length : 0,
        candidateCount: discoveryCandidates.length,
        sourceCount: sources.length,
      },
      finished_at: new Date().toISOString(),
    });

    return {
      ok: true,
      brief,
      candidates: discoveryCandidates,
      discoveryDiagnostics,
    };
  });

export const approveEditorialAngle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      id: z.string().uuid(),
      angle: z.object({
        id: z.string(),
        title: z.string(),
        question: z.string(),
        thesis: z.string(),
        coverage_plan: z.array(z.string()),
        source_ids: z.array(z.string()),
        source_urls: z.array(z.string()),
      }).or(z.object({
        id: z.string(),
        title: z.string(),
        question: z.string(),
        thesis: z.string(),
        coverage_plan: z.array(z.string()).optional(),
        source_ids: z.array(z.string()).optional(),
        source_urls: z.array(z.string()).optional(),
      })),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const angle = {
      ...data.angle,
      coverage_plan: data.angle.coverage_plan ?? [],
      source_ids: data.angle.source_ids ?? [],
      source_urls: data.angle.source_urls ?? [],
      approved_at: new Date().toISOString(),
    };
    const updated = await context.supabase
      .from("desk_stories")
      .update({
        approved_angle: angle,
        angle_status: "approved",
        editorial_outline: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updated.error) throw new Error(updated.error.message);
    return { ok: true, angle };
  });

export const generateEditorialOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    const { story, sources } = await loadStoryContext(supabase, data.id);

    if (story.editorial_type !== "feature" && story.editorial_type !== "explainer") {
      throw new Error("Outline is only available for Feature or Explainer");
    }
    if (story.angle_status !== "approved" || !story.approved_angle) {
      throw new Error("আগে একটি angle approve করুন");
    }
    if (!story.editorial_brief) {
      throw new Error("আগে Research Brief তৈরি করুন");
    }

    const outline = await generateEditorialOutline({
      title: String(story.title_hint || story.draft_title || "").trim(),
      editorialType: story.editorial_type,
      brief: story.editorial_brief,
      approvedAngle: story.approved_angle,
      sources,
    });

    const updated = await supabase
      .from("desk_stories")
      .update({
        editorial_outline: outline,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updated.error) throw new Error(updated.error.message);

    await supabase.from("desk_jobs").insert({
      story_id: data.id,
      stage: "editorial_outline",
      status: "ok",
      payload: {
        editorialType: story.editorial_type,
        provider: outline.provider,
        model: outline.model,
        sectionCount: Array.isArray(outline.sections) ? outline.sections.length : 0,
      },
      finished_at: new Date().toISOString(),
    });

    return { ok: true, outline };
  });
