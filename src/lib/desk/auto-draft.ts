import { discoverRelatedCoverage } from "@/lib/desk/discovery";
import { canonicalizeUrl } from "@/lib/desk/url";
import { runDeskIngestCore } from "@/lib/desk/ingest.functions";
import { getAIProvider, getArticleProvider, toLegacyPacket, parseArticleDepth, validateGeneratedArticle } from "@/lib/desk/ai";
import { toSourcePackets } from "@/lib/desk/research.functions";
import { slugifyBangla } from "@/lib/bangla";
import { makePublicId } from "@/lib/ids";

const DEFAULT_AUTO_LIMIT = 4;
const MAX_AUTO_LIMIT = 8;
const AUTO_CONCURRENCY = 2;
const MIN_SOURCES_FOR_ARTICLE = 2;
const MIN_RELEVANCE = 0.5;
const AUTO_LOCK_MINUTES = 30;
const MAX_AUTO_ATTEMPTS = 3;
const RETRY_DELAYS_MINUTES = [15, 60, 240];

function envNumber(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback);
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.round(raw))) : fallback;
}

function candidateScore(story: any) {
  const sourceCount = Number(story.source_count || 0);
  const ageHours = Math.max(0, (Date.now() - new Date(story.created_at || Date.now()).getTime()) / 3600000);
  const freshness = Math.max(0, 24 - ageHours);
  const warnings = story.warning ? 0 : 1;
  return sourceCount * 100 + freshness + warnings;
}

function retryDelayMinutes(attempt: number) {
  return RETRY_DELAYS_MINUTES[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MINUTES.length - 1)];
}

function isTransientAIError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:HTTP\s*(?:429|500|502|503|504)|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|RESOURCE_EXHAUSTED|UNAVAILABLE|rate.?limit|timeout|timed out)/i.test(message);
}

async function markAutoRetry(
  supabase: any,
  storyId: string,
  attempt: number,
  stage: string,
  message: string,
  permanent = false,
) {
  const retryable = !permanent && attempt < MAX_AUTO_ATTEMPTS;
  const nextAttempt = retryable
    ? new Date(Date.now() + retryDelayMinutes(attempt) * 60 * 1000).toISOString()
    : null;
  await supabase.from("desk_stories").update({
    status: "new",
    auto_processing_started_at: null,
    auto_next_attempt_at: nextAttempt,
    auto_failure_stage: stage,
    auto_attempts: attempt,
    last_error: message.slice(0, 1000),
    warning: retryable
      ? `Auto-draft retry scheduled in ${retryDelayMinutes(attempt)} minutes (${stage}).`
      : `Auto-draft stopped after ${attempt} attempts at ${stage}; manual review required.`,
    updated_at: new Date().toISOString(),
  }).eq("id", storyId);
}

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
  if (preferred.name !== "gemini") {
    throw new Error("Gemini research is not configured for auto-draft");
  }
  const research = await preferred.generateResearch({
    title: storyRes.data.title_hint || "",
    excerpt: rows.map((row: any) => row.excerpt || row.title || "").join(" "),
    sources,
  });
  const packet = toLegacyPacket(research);
  await supabase.from("desk_stories").update({
    research_status: research.summary ? "ready" : "needs_review",
    research_packet: packet,
    confirmed_facts: packet.keyFacts,
    unverified_claims: packet.needsVerification,
    conflicting_facts: packet.conflicts,
    warning: research.quality === "gemini"
      ? (research.warnings?.[0]?.message || null)
      : "Research needs manual review before article generation.",
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
    auto_processing_started_at: null,
    auto_next_attempt_at: null,
    auto_failure_stage: null,
    updated_at: new Date().toISOString(),
  }).eq("id", storyId);
  return { articleId, title: drafted.title };
}

async function processStory(supabase: any, story: any, userId?: string | null) {
  const lockTime = new Date().toISOString();
  const attempt = Number(story.auto_attempts || 0) + 1;
  const locked = await supabase.from("desk_stories").update({
    auto_processing_started_at: lockTime,
    status: "researching",
    auto_attempts: attempt,
    auto_failure_stage: null,
    auto_next_attempt_at: null,
    updated_at: lockTime,
  }).eq("id", story.id).is("auto_processing_started_at", null).select("id").maybeSingle();
  if (locked.error) throw new Error(locked.error.message);
  if (!locked.data?.id) return { id: story.id, step: "already_processing" };

  try {
    const discovery = await autoDiscoverAndAttach(supabase, story);
    const countRes = await supabase.from("desk_story_sources").select("id", { count: "exact", head: true }).eq("story_id", story.id);
    const count = countRes.count ?? 0;
    if (count < MIN_SOURCES_FOR_ARTICLE) {
      await markAutoRetry(
        supabase,
        story.id,
        attempt,
        "sources",
        `Only ${count} source(s) available; at least ${MIN_SOURCES_FOR_ARTICLE} are required.`,
      );
      return { id: story.id, step: "needs_sources", discovery, count };
    }

    const research = await autoResearch(supabase, story.id);
    if (!research.summary) {
      await markAutoRetry(supabase, story.id, attempt, "research", "Gemini research returned no usable summary.");
      return { id: story.id, step: "needs_research_review", discovery };
    }

    const article = await autoArticle(supabase, story.id, userId);
    return { id: story.id, step: "draft", discovery, article };
  } catch (err) {
    const message = err instanceof Error ? err.message : "auto-draft failed";
    const stage = /article/i.test(message) ? "article" : /research|gemini/i.test(message) ? "research" : "processing";
    const transient = isTransientAIError(err);
    await markAutoRetry(supabase, story.id, attempt, stage, message, !transient && attempt >= MAX_AUTO_ATTEMPTS);
    return { id: story.id, step: "error", error: message, retrying: transient && attempt < MAX_AUTO_ATTEMPTS };
  }
}

export async function runAutoDraftPipeline(supabase: any, opts?: { userId?: string | null; limit?: number }) {
  const started = Date.now();
  const ingest = await runDeskIngestCore(supabase);

  const cutoffLock = Date.now() - AUTO_LOCK_MINUTES * 60 * 1000;
  const cutoffIso = new Date(cutoffLock).toISOString();
  const recoveryPatch = {
    status: "new",
    auto_processing_started_at: null,
    auto_next_attempt_at: new Date().toISOString(),
    warning: "Recovered from a stale auto-draft lock.",
    updated_at: new Date().toISOString(),
  };

  // Recover legacy stories that were left in "researching" with no lock.
  await supabase
    .from("desk_stories")
    .update(recoveryPatch)
    .eq("status", "researching")
    .is("article_id", null)
    .is("auto_processing_started_at", null);

  // Recover stories abandoned by a timed-out function invocation.
  await supabase
    .from("desk_stories")
    .update(recoveryPatch)
    .eq("status", "researching")
    .is("article_id", null)
    .lt("auto_processing_started_at", cutoffIso);

  const limit = envNumber("DESK_AUTO_LIMIT", opts?.limit ?? DEFAULT_AUTO_LIMIT, 1, MAX_AUTO_LIMIT);
  const listed = await supabase
    .from("desk_stories")
    .select("id, title_hint, draft_title, status, source_count, article_id, warning, created_at, updated_at, auto_processing_started_at, auto_attempts, auto_next_attempt_at, auto_failure_stage")
    .eq("status", "new")
    .is("article_id", null)
    .order("updated_at", { ascending: false })
    .limit(Math.min(50, limit * 8));
  if (listed.error) throw new Error(listed.error.message);

  const now = Date.now();
  const candidates = (listed.data ?? [])
    .filter((story: any) => {
      const attempts = Number(story.auto_attempts || 0);
      if (attempts >= MAX_AUTO_ATTEMPTS) return false;
      const nextAttempt = story.auto_next_attempt_at ? new Date(story.auto_next_attempt_at).getTime() : 0;
      return !nextAttempt || nextAttempt <= now;
    })
    .sort((a: any, b: any) => candidateScore(b) - candidateScore(a))
    .slice(0, limit);

  const processed: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const story = candidates[index];
      const result = await processStory(supabase, story, opts?.userId);
      processed.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(AUTO_CONCURRENCY, candidates.length || 1) }, () => worker()));

  const summary = {
    durationMs: Date.now() - started,
    candidateCount: candidates.length,
    draftCount: processed.filter((row) => row.step === "draft").length,
    needsSources: processed.filter((row) => row.step === "needs_sources").length,
    needsResearchReview: processed.filter((row) => row.step === "needs_research_review").length,
    errors: processed.filter((row) => row.step === "error").length,
    retrying: processed.filter((row: any) => row.retrying).length,
  };

  await supabase.from("desk_jobs").insert({
    stage: "auto-draft",
    status: summary.errors ? "failed" : "ok",
    payload: { ingestCount: ingest.results.length, processed, summary },
    error: summary.errors ? "One or more auto-draft stories failed" : null,
    finished_at: new Date().toISOString(),
  });
  return { ingest, processed, summary };
}
