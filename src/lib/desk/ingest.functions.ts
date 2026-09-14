import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { fetchFeedXml, parseFeed } from "@/lib/desk/rss";
import { canonicalizeUrl, clusterKeyFromTitle } from "@/lib/desk/url";

export type IngestResult = {
  sourceId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  clustered: number;
  skipped: number;
  error: string | null;
};

async function logJob(supabase: any, stage: string, status: string, extra: Record<string, unknown>) {
  await supabase.from("desk_jobs").insert({
    stage,
    status,
    attempt: extra.attempt ?? 1,
    error: extra.error ?? null,
    payload: extra,
    finished_at: status === "queued" || status === "running" ? null : new Date().toISOString(),
  });
}

async function ingestSource(supabase: any, source: any): Promise<IngestResult> {
  const result: IngestResult = {
    sourceId: source.id,
    sourceName: source.name,
    fetched: 0,
    inserted: 0,
    clustered: 0,
    skipped: 0,
    error: null,
  };
  const now = new Date().toISOString();
  await supabase.from("news_sources").update({ last_fetched_at: now }).eq("id", source.id);

  if (!source.rss_url) {
    result.error = "RSS URL নেই";
    await supabase.from("news_sources").update({ last_error: result.error }).eq("id", source.id);
    return result;
  }

  try {
    const xml = await fetchFeedXml(source.rss_url);
    const items = parseFeed(xml).slice(0, 30);
    result.fetched = items.length;

    for (const item of items) {
      const canonical = canonicalizeUrl(item.url);
      if (!canonical) {
        result.skipped += 1;
        continue;
      }
      const existing = await supabase
        .from("desk_story_sources")
        .select("id")
        .or(`url.eq.${canonical},canonical_url.eq.${canonical}`)
        .maybeSingle();
      if (existing.data) {
        result.skipped += 1;
        continue;
      }

      const key = clusterKeyFromTitle(item.title);
      let story = (await supabase.from("desk_stories").select("id, source_count").eq("cluster_key", key).maybeSingle()).data;
      if (!story) {
        const created = await supabase
          .from("desk_stories")
          .insert({
            cluster_key: key,
            title_hint: item.title,
            category_slug: source.category_slug,
            status: "new",
            source_count: 1,
            warning: null,
          })
          .select("id, source_count")
          .single();
        if (created.error) throw new Error(created.error.message);
        story = created.data;
        result.inserted += 1;
      } else {
        await supabase
          .from("desk_stories")
          .update({
            source_count: (story.source_count ?? 1) + 1,
            updated_at: now,
            warning: (story.source_count ?? 1) + 1 >= 2 ? null : "এক সোর্স",
          })
          .eq("id", story.id);
        result.clustered += 1;
      }

      const row = {
        story_id: story.id,
        source_id: source.id,
        url: canonical,
        canonical_url: canonical,
        title: item.title,
        excerpt: item.excerpt,
        raw_text: item.excerpt,
        published_at: item.publishedAt,
        image_url: item.imageUrl,
        fetched_at: now,
      };
      let saved = await supabase.from("desk_story_sources").insert(row);
      if (saved.error && /column|schema cache|published_at|image_url|canonical_url/i.test(saved.error.message)) {
        saved = await supabase.from("desk_story_sources").insert({
          story_id: row.story_id,
          source_id: row.source_id,
          url: row.url,
          title: row.title,
          excerpt: row.excerpt,
          raw_text: row.raw_text,
          fetched_at: row.fetched_at,
        });
      }
      if (saved.error) {
        if (/duplicate|unique/i.test(saved.error.message)) result.skipped += 1;
        else throw new Error(saved.error.message);
      }
    }

    await supabase.from("news_sources").update({ last_success_at: now, last_error: null }).eq("id", source.id);
    await logJob(supabase, "ingest", "ok", { sourceId: source.id, sourceName: source.name, ...result });
  } catch (err) {
    result.error = err instanceof Error ? err.message : "ইনজেস্ট ব্যর্থ";
    await supabase.from("news_sources").update({ last_error: result.error }).eq("id", source.id);
    await logJob(supabase, "ingest", "failed", { sourceId: source.id, sourceName: source.name, error: result.error });
  }
  return result;
}

export const runDeskIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ sourceId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    let query = supabase.from("news_sources").select("*").eq("active", true).order("priority");
    if (data.sourceId) query = query.eq("id", data.sourceId);
    const { data: sources, error } = await query;
    if (error) throw new Error(error.message);
    const results: IngestResult[] = [];
    for (const source of sources ?? []) {
      results.push(await ingestSource(supabase, source));
    }
    return { results };
  });

export const listDeskJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { data, error } = await context.supabase
      .from("desk_jobs")
      .select("id, stage, status, error, payload, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
