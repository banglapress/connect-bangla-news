import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { getAIProvider, heuristicProvider, toLegacyPacket } from "@/lib/desk/ai";
import type { ResearchPacket, SourcePacket, StructuredResearch } from "@/lib/desk/ai";

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toSources(rows: any[], nameById: Map<string, string>): SourcePacket[] {
  return rows.map((row: any) => ({
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
}

async function persistResearchTables(supabase: any, storyId: string, research: StructuredResearch) {
  await supabase.from("desk_source_claims").delete().eq("story_id", storyId);
  await supabase.from("desk_fact_checks").delete().eq("story_id", storyId);
  for (const fact of research.key_facts.concat(research.unverified_claims).slice(0, 40)) {
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
      notes: fact.support === "multi_source" ? "Supported by two or more sources. Not automatically verified true." : null,
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
      const sources = toSources(rows, nameById);
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
        });
        research.warnings.push({
          code: "heuristic",
          message: `⚠ Gemini research failed, heuristic fallback used: ${err instanceof Error ? err.message : String(err)}`,
        });
        used = "heuristic_fallback";
      }

      const packet: ResearchPacket = toLegacyPacket(research);
      await persistResearchTables(supabase, data.id, research);

      const status =
        research.quality === "heuristic" || research.source_conflicts.length || (research.unverified_claims.length && !research.key_facts.length)
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
      const update = await supabase.from("desk_stories").update({
        ...coreUpdate,
        research_provider: research.provider,
        research_model: research.model,
        research_generated_at: research.generatedAt,
      }).eq("id", data.id);
      if (update.error && /column|schema cache|research_/i.test(update.error.message)) {
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
          inputTokens: research.usage?.inputTokens ?? null,
          outputTokens: research.usage?.outputTokens ?? null,
          durationMs: research.usage?.durationMs ?? null,
        },
        finished_at: new Date().toISOString(),
      });
      return { ok: true, status, packet, provider: used, model: research.model, quality: research.quality, warnings: research.warnings };
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
