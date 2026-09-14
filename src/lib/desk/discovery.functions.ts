import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { searchGdelt } from "@/lib/desk/discovery";
import { canonicalizeUrl } from "@/lib/desk/url";

export const findRelatedCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const story = await context.supabase.from("desk_stories").select("id, title_hint").eq("id", data.storyId).maybeSingle();
    if (!story.data) throw new Error("Story not found");
    const links = await context.supabase.from("desk_story_sources").select("url").eq("story_id", data.storyId);
    const urls = (links.data ?? []).map((row: { url: string }) => row.url);
    const result = await searchGdelt(story.data.title_hint || "", urls);
    let persistError: string | null = null;
    try {
      for (const hit of result.hits.slice(0, 15)) {
        const saved = await context.supabase.from("desk_discovery_hits").insert({
          story_id: data.storyId,
          provider: hit.provider,
          title: hit.title,
          url: hit.url,
          domain: hit.domain,
          published_at: hit.publishedAt,
          relevance: hit.relevance,
          raw: hit,
        });
        if (saved.error) persistError = saved.error.message;
      }
    } catch (err) {
      persistError = err instanceof Error ? err.message : "Could not store discovery hits";
    }
    await context.supabase.from("desk_jobs").insert({
      story_id: data.storyId,
      stage: "discovery",
      status: result.diagnostics.some((row) => row.error) ? "failed" : "ok",
      error: result.diagnostics.find((row) => row.error)?.error ?? persistError,
      payload: { provider: "gdelt", count: result.hits.length, diagnostics: result.diagnostics },
      finished_at: new Date().toISOString(),
    });
    return {
      hits: result.hits,
      provider: "gdelt",
      diagnostics: result.diagnostics,
      persistError,
    };
  });

export const addCoverageToStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      storyId: z.string().uuid(),
      title: z.string().min(1),
      url: z.string().url(),
      publishedAt: z.string().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const canonical = canonicalizeUrl(data.url);
    if (!canonical) throw new Error("Invalid URL");
    const exists = await context.supabase.from("desk_story_sources").select("id").eq("url", canonical).maybeSingle();
    if (exists.data) return { ok: true, duplicate: true };
    const sources = await context.supabase.from("news_sources").select("id, homepage_url, name");
    const host = new URL(canonical).hostname.replace(/^www\./, "");
    const matched = (sources.data ?? []).find((row: any) => (row.homepage_url || "").includes(host));
    let saved = await context.supabase.from("desk_story_sources").insert({
      story_id: data.storyId,
      source_id: matched?.id ?? null,
      url: canonical,
      canonical_url: canonical,
      title: data.title,
      excerpt: "Added from discovery. Not a trusted fact until reviewed.",
      raw_text: "",
      published_at: data.publishedAt || null,
      fetched_at: new Date().toISOString(),
      origin: "discovery",
      trusted: false,
    });
    if (saved.error && /column|schema cache|origin|trusted|canonical_url|published_at/i.test(saved.error.message)) {
      saved = await context.supabase.from("desk_story_sources").insert({
        story_id: data.storyId,
        source_id: matched?.id ?? null,
        url: canonical,
        title: data.title,
        excerpt: "Added from discovery. Not a trusted fact until reviewed.",
        fetched_at: new Date().toISOString(),
      });
    }
    if (saved.error) throw new Error(saved.error.message);
    const count = await context.supabase.from("desk_story_sources").select("id", { count: "exact", head: true }).eq("story_id", data.storyId);
    await context.supabase.from("desk_stories").update({
      source_count: count.count ?? 1,
      warning: "Includes discovery coverage. Verify before treating as fact.",
      updated_at: new Date().toISOString(),
    }).eq("id", data.storyId);
    return { ok: true, duplicate: false };
  });
