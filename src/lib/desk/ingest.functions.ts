import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { fetchFeedXml, parseFeed } from "@/lib/desk/rss";
import { canonicalizeUrl, clusterKeyFromTitle } from "@/lib/desk/url";
import { readIngestSettings } from "@/lib/desk/settings.functions";

export type IngestResult = {
  sourceId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  clustered: number;
  duplicates: number;
  skippedOld: number;
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

async function patchSource(supabase: any, id: string, payload: Record<string, unknown>) {
  const res = await supabase.from("news_sources").update(payload).eq("id", id);
  if (res.error && !/column|schema cache/i.test(res.error.message)) throw new Error(res.error.message);
}

async function alreadyHaveUrl(supabase: any, canonical: string) {
  const byUrl = await supabase.from("desk_story_sources").select("id").eq("url", canonical).maybeSingle();
  if (byUrl.data) return true;
  const byCanon = await supabase.from("desk_story_sources").select("id").eq("canonical_url", canonical).maybeSingle();
  return !!byCanon.data && !byCanon.error;
}

function cutoffFor(source: { last_success_at?: string | null }, lookbackHours: number) {
  if (source.last_success_at) {
    const watermark = new Date(source.last_success_at).getTime() - 2 * 60 * 1000;
    return new Date(watermark);
  }
  return new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
}

function clusterWarning(existingTitle: string | null, incomingTitle: string, key: string) {
  if (key.length < 18) return "শিরোনাম সাদৃশ্য। ভুল ক্লাস্টার হতে পারে";
  if (existingTitle && clusterKeyFromTitle(existingTitle) !== key) return "শিরোনাম মেলেনি। ক্লাস্টার যাচাই করুন";
  return null;
}

async function ingestSource(supabase: any, source: any, settings: { lookbackHours: number; maxItems: number }): Promise<IngestResult> {
  const result: IngestResult = {
    sourceId: source.id,
    sourceName: source.name,
    fetched: 0,
    inserted: 0,
    clustered: 0,
    duplicates: 0,
    skippedOld: 0,
    error: null,
  };
  const now = new Date();
  const nowIso = now.toISOString();
  await patchSource(supabase, source.id, { last_fetched_at: nowIso });

  if (!source.rss_url) {
    result.error = "RSS URL নেই";
    await patchSource(supabase, source.id, { last_error: result.error });
    return result;
  }

  try {
    const xml = await fetchFeedXml(source.rss_url);
    const items = parseFeed(xml);
    result.fetched = items.length;
    const cutoff = cutoffFor(source, settings.lookbackHours);
    let accepted = 0;

    for (const item of items) {
      const canonical = canonicalizeUrl(item.url);
      if (!canonical) {
        result.duplicates += 1;
        continue;
      }
      if (await alreadyHaveUrl(supabase, canonical)) {
        result.duplicates += 1;
        continue;
      }

      const published = item.publishedAt ? new Date(item.publishedAt) : null;
      const hasDate = !!(published && !Number.isNaN(published.getTime()));
      if (hasDate && published.getTime() < cutoff.getTime()) {
        result.skippedOld += 1;
        continue;
      }
      if (!hasDate && !source.last_success_at) {
        result.skippedOld += 1;
        continue;
      }
      if (accepted >= settings.maxItems) {
        result.skippedOld += 1;
        continue;
      }

      const key = clusterKeyFromTitle(item.title);
      const existing = await supabase.from("desk_stories").select("id, source_count, title_hint").eq("cluster_key", key).maybeSingle();
      let story = existing.data;
      if (!story) {
        const created = await supabase
          .from("desk_stories")
          .insert({
            cluster_key: key,
            title_hint: item.title,
            category_slug: source.category_slug,
            status: "new",
            source_count: 1,
            warning: "এক সোর্স",
          })
          .select("id, source_count, title_hint")
          .single();
        if (created.error) throw new Error(created.error.message);
        story = created.data;
        result.inserted += 1;
      } else {
        const nextCount = (story.source_count ?? 1) + 1;
        const warning = clusterWarning(story.title_hint, item.title, key);
        await supabase
          .from("desk_stories")
          .update({ source_count: nextCount, updated_at: nowIso, warning })
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
        fetched_at: nowIso,
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
        if (/duplicate|unique/i.test(saved.error.message)) result.duplicates += 1;
        else throw new Error(saved.error.message);
        continue;
      }
      accepted += 1;
    }

    await patchSource(supabase, source.id, { last_success_at: nowIso, last_error: null });
    await logJob(supabase, "ingest", "ok", { sourceId: source.id, sourceName: source.name, ...result });
  } catch (err) {
    result.error = err instanceof Error ? err.message : "ইনজেস্ট ব্যর্থ";
    await patchSource(supabase, source.id, { last_error: result.error });
    await logJob(supabase, "ingest", "failed", { sourceId: source.id, sourceName: source.name, error: result.error });
  }
  return result;
}

export const runDeskIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ sourceId: z.string().uuid().optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const settings = await readIngestSettings(context.supabase);
    let query = context.supabase.from("news_sources").select("*").eq("active", true).order("priority");
    if (data?.sourceId) query = query.eq("id", data.sourceId);
    const { data: sources, error } = await query;
    if (error) throw new Error(error.message);
    const results: IngestResult[] = [];
    for (const source of sources ?? []) results.push(await ingestSource(context.supabase, source, settings));
    return { results, settings };
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
