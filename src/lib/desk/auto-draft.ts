import { discoverRelatedCoverage } from "@/lib/desk/discovery";
import { canonicalizeUrl } from "@/lib/desk/url";
import { runDeskIngestCore } from "@/lib/desk/ingest.functions";
import { getAIProvider, getArticleProvider, heuristicProvider, toLegacyPacket, parseArticleDepth, validateGeneratedArticle } from "@/lib/desk/ai";
import { toSourcePackets } from "@/lib/desk/research.functions";
import { slugifyBangla } from "@/lib/bangla";
import { makePublicId } from "@/lib/ids";

const AUTO_LIMIT = 6;
const MIN_SOURCES_FOR_ARTICLE = 2;
const MIN_RELEVANCE = 0.5;

async function autoDiscoverAndAttach(supabase: any, story: any) {
  const links = await supabase.from("desk_story_sources").select("url, excerpt, title, raw_text").eq("story_id", story.id);
  const urls = (links.data ?? []).map((row: { url: string }) => row.url);
  const excerpt = (links.data ?? []).map((row: any) => row.excerpt || row.raw_text || row.title || "").join(" ");
  const title = String(story.title_hint || story.draft_title || links.data?.[0]?.title || "").trim();
  if (!title) return { added: 0, hits: 0 };
  const result = await discoverRelatedCoverage({ title, excerpt, knownUrls: urls });
  let added = 0;
  for (const hit of result.hits.filter((row) => row.relevance >= MIN_RELEVANCE).slice(0, 4)) {
    const url = (canonicalizeUrl(hit.url) || hit.url).replace(/\/$/, "");
    const exists = await supabase.from("desk_story_sources").select("id").eq("url", url).maybeSingle();
    if (exists.data) continue;
    const saved = await supabase.from("desk_story_sources").insert({
      story_id: story.id,
      url,
      canonical_url: url,
      title: hit.title,
      excerpt: hit.snippet || "Added by auto-draft discovery. Verify before treating as fact.",
      raw_text: hit.snippet || "",
      published_at: hit.publishedAt || null,
      fetched_at: new Date().toISOString(),
      origin: "discovery",
      trusted: false,
    });
    if (!saved.error) added += 1;
  }
  const count = await supabase.from("desk_story_sources").select("id", { count: "exact", head: true }).eq("story_id", story.id);
  await supabase.from("desk_stories").update({
    source_count: count.count ?? story.source_count,
    warning: added ? "Auto draft attached related coverage. Review sources before publish." : story.warning,
    updated_at: new Date().toISOString(),
  }).eq("id", story.id);
  return { added, hits: result.hits.length };
}

async function autoResearch(supabase: any, storyId: string) {
  const storyRes = await supabase.from("desk_stories").select("*").eq("id", storyId).single();
  if (storyRes.error) throw new Error(storyRes.error.message);
  const srcRes = await supabase.from("desk_story_sources").select("*").eq("story_id", storyId);
  const rows = srcRes.data ?? [];
  if (rows.length < 1) throw new Error("No sources");
  const names = await supabase.from("news_sources").select("id, name");
  const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
  const sources = toSourcePackets(rows, nameById);
  const preferred = getAIProvider();
  let research;
  try {
    research = await preferred.generateResearch({
      title: storyRes.data.title_hint || "",
      excerpt: rows.map((row: any) => row.excerpt || row.title || "").join(" "),
      sources,
    });
  } catch {
    research = await heuristicProvider.generateResearch({
      title: storyRes.data.title_hint || "",
      sources,
    });
  }
  const packet = toLegacyPacket(research);
  await supabase.from("desk_stories").update({
    research_status: research.summary ? "ready" : "needs_review",
    research_packet: packet,
    confirmed_facts: packet.keyFacts,
    unverified_claims: packet.needsVerification,
    conflicting_facts: packet.conflicts,
    warning: research.warnings?.[0]?.message || null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", storyId);
  return research;
}

async function autoArticle(supabase: any, storyId: string, userId?: string | null) {
  const storyRes = await supabase.from("desk_stories").select("*").eq("id", storyId).single();
  if (storyRes.error) throw new Error(storyRes.error.message);
  const story = storyRes.data;
  const packet = story.research_packet?.structured || story.research_packet;
  if (!packet) throw new Error("Research missing");
  const srcRes = await supabase.from("desk_story_sources").select("*").eq("story_id", storyId);
  const names = await supabase.from("news_sources").select("id, name");
  const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
  const sources = toSourcePackets(srcRes.data ?? [], nameById);
  const depth = parseArticleDepth(story.article_depth || "standard");
  const provider = getArticleProvider();
  const drafted = await provider.generateArticle({
    title: story.title_hint || "",
    categorySlug: story.category_slug || "national",
    research: packet,
    sources,
    depth,
  });
  const checked = validateGeneratedArticle({
    article: drafted,
    research: packet,
    sources,
    utilization: story.source_utilization || [],
    depth,
  });
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
    author_id: userId || null,
    public_id: makePublicId(),
    is_lead: false,
    is_featured: false,
    status: "draft",
    published_at: null,
  };
  let articleId = story.article_id as string | null;
  if (!articleId) {
    const inserted = await supabase.from("articles").insert(payload).select("id").single();
    if (inserted.error) throw new Error(inserted.error.message);
    articleId = inserted.data.id;
  } else {
    await supabase.from("articles").update({
      title: payload.title,
      slug: payload.slug,
      excerpt: payload.excerpt,
      body: payload.body,
      category_slug: payload.category_slug,
      tags: payload.tags,
      status: "draft",
    }).eq("id", articleId);
  }
  await supabase.from("desk_stories").update({
    article_id: articleId,
    draft_title: drafted.title,
    draft_excerpt: drafted.excerpt,
    draft_body: drafted.body,
    status: "draft",
    article_status: checked.article_status || "ready",
    warning: "Auto draft. Edit text and cover before publish.",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", storyId);
  return { articleId, title: drafted.title };
}

export async function runAutoDraftPipeline(supabase: any, opts?: { userId?: string | null; limit?: number }) {
  const ingest = await runDeskIngestCore(supabase);
  const since = new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString();
  const listed = await supabase
    .from("desk_stories")
    .select("id, title_hint, draft_title, status, source_count, article_id, warning, created_at")
    .in("status", ["new", "researching"])
    .is("article_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? AUTO_LIMIT);
  if (listed.error) throw new Error(listed.error.message);
  const processed: Array<Record<string, unknown>> = [];
  for (const story of listed.data ?? []) {
    try {
      const discovery = await autoDiscoverAndAttach(supabase, story);
      const countRes = await supabase.from("desk_story_sources").select("id", { count: "exact", head: true }).eq("story_id", story.id);
      const count = countRes.count ?? 0;
      if (count < MIN_SOURCES_FOR_ARTICLE) {
        await supabase.from("desk_stories").update({
          warning: "Auto draft stopped before research — add or confirm sources.",
          updated_at: new Date().toISOString(),
        }).eq("id", story.id);
        processed.push({ id: story.id, step: "needs_sources", discovery, count });
        continue;
      }
      await autoResearch(supabase, story.id);
      const article = await autoArticle(supabase, story.id, opts?.userId);
      processed.push({ id: story.id, step: "draft", discovery, article });
    } catch (err) {
      const message = err instanceof Error ? err.message : "auto-draft failed";
      await supabase.from("desk_stories").update({ last_error: message, updated_at: new Date().toISOString() }).eq("id", story.id);
      processed.push({ id: story.id, step: "error", error: message });
    }
  }
  await supabase.from("desk_jobs").insert({
    stage: "auto-draft",
    status: "ok",
    payload: { ingestCount: ingest.results.length, processed },
    finished_at: new Date().toISOString(),
  });
  return { ingest, processed };
}
