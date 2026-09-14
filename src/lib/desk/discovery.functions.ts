import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { discoverRelatedCoverage } from "@/lib/desk/discovery";
import { canonicalizeUrl } from "@/lib/desk/url";

function titleKey(domain: string, title: string) {
  return `${(domain || "").replace(/^www\./, "").toLowerCase()}::${title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
}

async function existingKeys(supabase: any, storyId: string) {
  const rows = await supabase
    .from("desk_discovery_hits")
    .select("id, url, domain, title")
    .eq("story_id", storyId);
  const urls = new Set<string>();
  const titles = new Set<string>();
  for (const row of rows.data ?? []) {
    if (row.url) urls.add(String(row.url).replace(/\/$/, ""));
    titles.add(titleKey(row.domain || "", row.title || ""));
  }
  return { urls, titles };
}

export const findRelatedCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ storyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const story = await context.supabase.from("desk_stories").select("id, title_hint").eq("id", data.storyId).maybeSingle();
    if (!story.data) throw new Error("Story not found");
    const links = await context.supabase.from("desk_story_sources").select("url, excerpt, title").eq("story_id", data.storyId);
    const urls = (links.data ?? []).map((row: { url: string }) => row.url);
    const excerpt = (links.data ?? []).map((row: { excerpt?: string; title?: string }) => row.excerpt || row.title || "").join(" ");
    const result = await discoverRelatedCoverage({
      title: story.data.title_hint || "",
      excerpt,
      knownUrls: urls,
    });

    const existing = await existingKeys(context.supabase, data.storyId);
    let persistError: string | null = null;
    const savedHits: any[] = [];
    for (const hit of result.hits.slice(0, 16)) {
      const url = (canonicalizeUrl(hit.url) || hit.url).replace(/\/$/, "");
      const key = titleKey(hit.domain || "", hit.title);
      if (existing.urls.has(url) || existing.titles.has(key)) continue;
      existing.urls.add(url);
      existing.titles.add(key);
      const row = {
        story_id: data.storyId,
        provider: hit.provider,
        title: hit.title,
        url,
        domain: hit.domain,
        published_at: hit.publishedAt,
        snippet: hit.snippet,
        relevance: hit.relevance,
        query: hit.query,
        status: "new",
        added: false,
        raw: hit,
      };
      let saved = await context.supabase.from("desk_discovery_hits").insert(row).select("*").maybeSingle();
      if (saved.error && /column|schema cache|snippet|query|status/i.test(saved.error.message)) {
        saved = await context.supabase.from("desk_discovery_hits").insert({
          story_id: row.story_id,
          provider: row.provider,
          title: row.title,
          url: row.url,
          domain: row.domain,
          published_at: row.published_at,
          relevance: row.relevance,
          added: false,
          raw: hit,
        }).select("*").maybeSingle();
      }
      if (saved.error) persistError = saved.error.message;
      else if (saved.data) savedHits.push(saved.data);
    }

    const listed = await context.supabase
      .from("desk_discovery_hits")
      .select("*")
      .eq("story_id", data.storyId)
      .order("created_at", { ascending: false });

    await context.supabase.from("desk_jobs").insert({
      story_id: data.storyId,
      stage: "discovery",
      status: result.diagnostics.some((row) => row.error && row.provider === "google_news" && !result.hits.length)
        ? "failed"
        : "ok",
      error: result.diagnostics.find((row) => row.error)?.error ?? persistError,
      payload: {
        provider: result.provider,
        queries: result.queries,
        count: result.hits.length,
        diagnostics: result.diagnostics,
      },
      finished_at: new Date().toISOString(),
    });

    return {
      hits: listed.error ? savedHits : listed.data ?? savedHits,
      provider: result.provider,
      queries: result.queries,
      diagnostics: result.diagnostics,
      persistError,
    };
  });

export const setDiscoveryHitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      storyId: z.string().uuid(),
      hitIds: z.array(z.string().uuid()).min(1),
      status: z.enum(["new", "added", "ignored"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const patch: Record<string, unknown> = { status: data.status, added: data.status === "added" };
    let updated = await context.supabase
      .from("desk_discovery_hits")
      .update(patch)
      .eq("story_id", data.storyId)
      .in("id", data.hitIds);
    if (updated.error && /column|schema cache|status/i.test(updated.error.message)) {
      updated = await context.supabase
        .from("desk_discovery_hits")
        .update({ added: data.status === "added" })
        .eq("story_id", data.storyId)
        .in("id", data.hitIds);
    }
    if (updated.error) throw new Error(updated.error.message);
    return { ok: true };
  });

export const addCoverageToStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      storyId: z.string().uuid(),
      title: z.string().min(1),
      url: z.string().url(),
      publishedAt: z.string().nullable().optional(),
      excerpt: z.string().nullable().optional(),
      hitId: z.string().uuid().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const canonical = canonicalizeUrl(data.url);
    if (!canonical) throw new Error("Invalid URL");
    const exists = await context.supabase.from("desk_story_sources").select("id").eq("url", canonical).maybeSingle();
    if (exists.data) {
      if (data.hitId) {
        await context.supabase.from("desk_discovery_hits").update({ status: "added", added: true }).eq("id", data.hitId);
      }
      return { ok: true, duplicate: true };
    }
    const byCanon = await context.supabase.from("desk_story_sources").select("id").eq("canonical_url", canonical).maybeSingle();
    if (byCanon.data && !byCanon.error) {
      if (data.hitId) {
        await context.supabase.from("desk_discovery_hits").update({ status: "added", added: true }).eq("id", data.hitId);
      }
      return { ok: true, duplicate: true };
    }
    const sources = await context.supabase.from("news_sources").select("id, homepage_url, name");
    const host = new URL(canonical).hostname.replace(/^www\./, "");
    const matched = (sources.data ?? []).find((row: any) => {
      const homepage = String(row.homepage_url || "").toLowerCase();
      return homepage.includes(host) || (host && homepage.includes(host.split(".").slice(-2).join(".")));
    });
    let saved = await context.supabase.from("desk_story_sources").insert({
      story_id: data.storyId,
      source_id: matched?.id ?? null,
      url: canonical,
      canonical_url: canonical,
      title: data.title,
      excerpt: data.excerpt || "Added from discovery. Not a trusted fact until reviewed.",
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
        excerpt: data.excerpt || "Added from discovery. Not a trusted fact until reviewed.",
        fetched_at: new Date().toISOString(),
      });
    }
    if (saved.error) throw new Error(saved.error.message);
    if (data.hitId) {
      await context.supabase.from("desk_discovery_hits").update({ status: "added", added: true }).eq("id", data.hitId);
    } else {
      await context.supabase
        .from("desk_discovery_hits")
        .update({ status: "added", added: true })
        .eq("story_id", data.storyId)
        .eq("url", canonical);
    }
    const count = await context.supabase.from("desk_story_sources").select("id", { count: "exact", head: true }).eq("story_id", data.storyId);
    await context.supabase.from("desk_stories").update({
      source_count: count.count ?? 1,
      warning: "Includes discovery coverage. Verify before treating as fact.",
      updated_at: new Date().toISOString(),
    }).eq("id", data.storyId);
    return { ok: true, duplicate: false };
  });
