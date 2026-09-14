import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import {
  getAIProvider,
  heuristicProvider,
  toLegacyPacket,
  extractSourceNote,
  markUniqueNotes,
  utilizationFromNotes,
  packSourceNotes,
  sourceFingerprint,
  parseArticleDepth,
  inferArticleDepth,
} from "@/lib/desk/ai";
import type { ArticleDepth, ResearchPacket, SourcePacket, StructuredResearch } from "@/lib/desk/ai";

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function toSourcePackets(rows: any[], nameById: Map<string, string>): SourcePacket[] {
  return rows.map((row: any) => {
    const excerpt = String(row.excerpt || "");
    const rawText = String(row.raw_text || "");
    const availableText = [row.title, rawText.length >= excerpt.length ? rawText : excerpt].filter(Boolean).join("\n");
    const chars = availableText.replace(/\s+/g, " ").trim().length;
    return {
      sourceRowId: row.id,
      sourceId: row.source_id,
      sourceName: nameById.get(row.source_id) || hostnameOf(row.url) || "Source",
      title: row.title || "",
      url: row.url,
      excerpt: excerpt || rawText,
      publishedAt: row.published_at || null,
      origin: row.origin || null,
      trusted: row.trusted === true,
      domain: hostnameOf(row.url),
      rawText,
      availableText,
      contentLevel: chars >= 1500 ? "full" : chars >= 220 ? "partial" : "metadata_only",
    };
  });
}

async function persistResearchTables(supabase: any, storyId: string, research: StructuredResearch) {
  await supabase.from("desk_source_claims").delete().eq("story_id", storyId);
  await supabase.from("desk_fact_checks").delete().eq("story_id", storyId);
  const facts = [
    ...research.key_facts,
    ...(research.detailed_facts || []),
    ...(research.unique_details || []),
    ...research.unverified_claims,
  ];
  const seen = new Set<string>();
  for (const fact of facts.slice(0, 50)) {
    const key = fact.text.slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    await supabase.from("desk_source_claims").insert({
      story_id: storyId,
      source_row_id: fact.source_ids[0] || null,
      source_url: fact.source_urls[0] || null,
      claim_text: fact.text,
      claim_type: fact.support,
    });
    await supabase.from("desk_fact_checks").insert({
      story_id: storyId,
      fact_text: fact.text,
      status: fact.support === "multi_source" ? "multi_source_supported" : fact.support,
      supporting_source_ids: fact.source_ids,
      conflicting_source_ids: [],
      notes:
        fact.support === "multi_source"
          ? "Supported by two or more listed sources. Not automatically verified true."
          : null,
    });
  }
  for (const conflict of research.source_conflicts.slice(0, 12)) {
    await supabase.from("desk_fact_checks").insert({
      story_id: storyId,
      fact_text: conflict.text,
      status: "conflicting",
      supporting_source_ids: conflict.sides.flatMap((side) => side.source_ids),
      conflicting_source_ids: [],
      notes: "⚠ Conflicting information",
    });
  }
}

export const getDeskStoryDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const storyRes = await context.supabase.from("desk_stories").select("*").eq("id", data.id).maybeSingle();
    if (storyRes.error) throw new Error(storyRes.error.message);
    if (!storyRes.data) throw new Error("স্টোরি পাওয়া যায়নি");
    const sourcesRes = await context.supabase.from("desk_story_sources").select("*").eq("story_id", data.id);
    const claimsRes = await context.supabase.from("desk_source_claims").select("*").eq("story_id", data.id);
    const factsRes = await context.supabase.from("desk_fact_checks").select("*").eq("story_id", data.id);
    const hitsRes = await context.supabase
      .from("desk_discovery_hits")
      .select("*")
      .eq("story_id", data.id)
      .order("relevance", { ascending: false });
    const jobsRes = await context.supabase
      .from("desk_jobs")
      .select("id, stage, status, error, payload, created_at, finished_at")
      .eq("story_id", data.id)
      .in("stage", ["research", "article"])
      .order("created_at", { ascending: false })
      .limit(8);
    return {
      story: storyRes.data,
      sources: sourcesRes.data ?? [],
      claims: claimsRes.error ? [] : claimsRes.data ?? [],
      facts: factsRes.error ? [] : factsRes.data ?? [],
      discoveryHits: hitsRes.error ? [] : hitsRes.data ?? [],
      jobs: jobsRes.error ? [] : jobsRes.data ?? [],
    };
  });

export const saveDeskArticleDepth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), depth: z.enum(["brief", "standard", "detailed", "comprehensive"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const depth = parseArticleDepth(data.depth);
    const update = await context.supabase
      .from("desk_stories")
      .update({ article_depth: depth, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (update.error && /column|schema cache|article_depth/i.test(update.error.message)) {
      return { ok: true, depth, persisted: false };
    }
    if (update.error) throw new Error(update.error.message);
    return { ok: true, depth, persisted: true };
  });

export const prepareResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const supabase = context.supabase;
    await supabase.from("desk_stories").update({ research_status: "processing", updated_at: new Date().toISOString() }).eq("id", data.id);
    try {
      const storyRes = await supabase.from("desk_stories").select("*").eq("id", data.id).single();
      if (storyRes.error) throw new Error(storyRes.error.message);
      const srcRes = await supabase.from("desk_story_sources").select("*").eq("story_id", data.id);
      const rows = srcRes.data ?? [];
      if (!rows.length) throw new Error("Add at least one source before preparing research");
      const names = await supabase.from("news_sources").select("id, name");
      const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
      const sources = toSourcePackets(rows, nameById);
      const notes = markUniqueNotes(
        sources.map((source) =>
          extractSourceNote({
            source_row_id: source.sourceRowId,
            source_name: source.sourceName,
            url: source.url,
            published_at: source.publishedAt,
            origin: source.origin,
            title: source.title,
            excerpt: source.excerpt,
            raw_text: source.rawText || source.availableText || source.excerpt,
          }),
        ),
      );
      const utilization = utilizationFromNotes(notes);
      const packed = packSourceNotes(notes, 18000);
      const claimsRes = await supabase.from("desk_source_claims").select("claim_text, source_url, claim_type").eq("story_id", data.id);
      const factsRes = await supabase.from("desk_fact_checks").select("fact_text, status").eq("story_id", data.id);

      const preferred = getAIProvider();
      let research: StructuredResearch;
      let used = preferred.name;
      try {
        research = await preferred.generateResearch({
          title: storyRes.data.title_hint || "",
          excerpt: rows.map((row: any) => row.excerpt || row.title || "").join(" "),
          sources,
          sourceNotes: packed.packed,
          truncated: packed.truncated,
          existingClaims: (claimsRes.data ?? []).map((row: any) => ({
            text: row.claim_text,
            source_url: row.source_url,
            claim_type: row.claim_type,
          })),
          existingFacts: (factsRes.data ?? []).map((row: any) => ({ text: row.fact_text, status: row.status })),
        });
      } catch (err) {
        if (preferred.name === "heuristic") throw err;
        research = await heuristicProvider.generateResearch({
          title: storyRes.data.title_hint || "",
          sources,
          sourceNotes: packed.packed,
          truncated: packed.truncated,
        });
        research.warnings.push({
          code: "heuristic",
          message: `⚠ Gemini research failed, heuristic fallback used: ${err instanceof Error ? err.message : String(err)}`,
        });
        used = "heuristic_fallback";
      }

      research.source_utilization = utilization;
      research.source_notes = notes.map((note) => ({
        source_row_id: note.source_row_id,
        source_name: note.source_name,
        url: note.url,
        available_content_level: note.available_content_level,
        original_title: note.original_title,
        main_event: note.main_event,
        unique_information: note.unique_information,
        quotes: note.quotes,
        numbers: note.numbers,
        missing_information: note.missing_information,
      }));
      research.source_fingerprint = sourceFingerprint(sources.map((row) => row.sourceRowId));
      research.truncated = research.truncated === true || packed.truncated;
      research.version = 2;

      const packet: ResearchPacket = toLegacyPacket(research);
      await persistResearchTables(supabase, data.id, research);

      const richSources = utilization.filter((row) => row.available_content_level !== "metadata_only").length;
      const inferredDepth: ArticleDepth = inferArticleDepth({ sourceCount: sources.length, richSources });
      const storedDepth = parseArticleDepth(storyRes.data.article_depth);
      const articleDepth = storyRes.data.article_depth ? storedDepth : inferredDepth;

      const researchQuality = {
        facts: (research.detailed_facts || research.key_facts).length,
        unique_details: research.unique_details?.length || notes.reduce((sum, note) => sum + note.unique_information.length, 0),
        quotes: research.important_quotes.length,
        conflicts: research.source_conflicts.length,
        warnings: research.warnings.length,
        source_count: sources.length,
        rich_sources: richSources,
      };

      const status =
        research.quality === "heuristic" ||
        research.source_conflicts.length ||
        research.warnings.some((row) => row.code === "limited_content") ||
        (research.unverified_claims.length && !research.key_facts.length)
          ? "needs_review"
          : research.summary
            ? "ready"
            : "needs_review";

      const coreUpdate = {
        research_status: status,
        research_packet: packet,
        confirmed_facts: packet.keyFacts,
        unverified_claims: packet.needsVerification,
        conflicting_facts: packet.conflicts,
        warning: research.warnings[0]?.message || null,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      const update = await supabase
        .from("desk_stories")
        .update({
          ...coreUpdate,
          research_provider: research.provider,
          research_model: research.model,
          research_generated_at: research.generatedAt,
          research_version: 2,
          source_utilization: utilization,
          research_quality: researchQuality,
          article_depth: articleDepth,
        })
        .eq("id", data.id);
      if (update.error && /column|schema cache|research_|source_utilization|article_depth/i.test(update.error.message)) {
        const fallback = await supabase.from("desk_stories").update(coreUpdate).eq("id", data.id);
        if (fallback.error) throw new Error(fallback.error.message);
      } else if (update.error) {
        throw new Error(update.error.message);
      }

      await supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "research",
        status: "ok",
        payload: {
          provider: used,
          model: research.model,
          quality: research.quality,
          version: 2,
          truncated: research.truncated === true,
          inputTokens: research.usage?.inputTokens ?? null,
          outputTokens: research.usage?.outputTokens ?? null,
          durationMs: research.usage?.durationMs ?? null,
          sourceCount: sources.length,
          richSources,
          warningCount: research.warnings.length,
        },
        finished_at: new Date().toISOString(),
      });
      return {
        ok: true,
        status,
        packet,
        provider: used,
        model: research.model,
        quality: research.quality,
        warnings: research.warnings,
        utilization,
        researchQuality,
        articleDepth,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Research failed";
      await supabase.from("desk_stories").update({ research_status: "failed", last_error: message }).eq("id", data.id);
      await supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "research",
        status: "failed",
        error: message,
        payload: { provider: getAIProvider().name },
        finished_at: new Date().toISOString(),
      });
      throw new Error(message);
    }
  });
