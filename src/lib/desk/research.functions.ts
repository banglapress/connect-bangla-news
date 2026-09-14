import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { getAIProvider } from "@/lib/desk/ai";
import type { ResearchPacket, SourcePacket } from "@/lib/desk/ai";

function overlap(a: string, b: string) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tb = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!ta.size || !tb.length) return 0;
  const hit = tb.filter((w) => ta.has(w)).length;
  return hit / Math.max(ta.size, tb.length);
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
    return {
      story: storyRes.data,
      sources: sourcesRes.data ?? [],
      claims: claimsRes.error ? [] : claimsRes.data ?? [],
      facts: factsRes.error ? [] : factsRes.data ?? [],
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
      const names = await supabase.from("news_sources").select("id, name");
      const nameById = new Map((names.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
      const sources: SourcePacket[] = rows.map((row: any) => ({
        sourceRowId: row.id,
        sourceId: row.source_id,
        sourceName: nameById.get(row.source_id) || "Source",
        title: row.title || "",
        url: row.url,
        excerpt: row.excerpt || row.raw_text || "",
        publishedAt: row.published_at,
      }));
      await supabase.from("desk_source_claims").delete().eq("story_id", data.id);
      await supabase.from("desk_fact_checks").delete().eq("story_id", data.id);
      const provider = getAIProvider();
      const extracted = [];
      for (const source of sources) {
        const claims = await provider.extractClaims(source);
        for (const claim of claims) {
          extracted.push({ source, claim });
          await supabase.from("desk_source_claims").insert({
            story_id: data.id,
            source_row_id: source.sourceRowId,
            source_id: source.sourceId,
            source_url: source.url,
            claim_text: claim.text,
            claim_type: claim.type,
          });
        }
      }

      const groups: { text: string; sources: SourcePacket[]; types: string[] }[] = [];
      for (const row of extracted) {
        const found = groups.find((g) => overlap(g.text, row.claim.text) >= 0.45);
        if (found) {
          if (!found.sources.some((s) => s.url === row.source.url)) found.sources.push(row.source);
          found.types.push(row.claim.type);
        } else {
          groups.push({ text: row.claim.text, sources: [row.source], types: [row.claim.type] });
        }
      }

      const facts = [];
      for (const group of groups) {
        const status = group.sources.length >= 2 ? "confirmed" : "unverified";
        const insert = await supabase.from("desk_fact_checks").insert({
          story_id: data.id,
          fact_text: group.text,
          status,
          supporting_source_ids: group.sources.map((s) => s.sourceRowId),
          conflicting_source_ids: [],
          confidence: group.sources.length >= 2 ? 0.7 : 0.35,
        });
        if (!insert.error) facts.push({ ...group, status });
      }

      const packet: ResearchPacket = {
        whatHappened: await provider.summarizeTopic(sources),
        keyFacts: facts.filter((f) => f.status === "confirmed").map((f) => f.text),
        dates: extracted.filter((e) => e.claim.type === "date").map((e) => e.claim.text),
        people: extracted.filter((e) => e.claim.type === "person").map((e) => e.claim.text),
        numbers: extracted.filter((e) => e.claim.type === "number").map((e) => e.claim.text),
        conflicts: [],
        needsVerification: facts.filter((f) => f.status === "unverified").map((f) => f.text),
        sourceLinks: sources.map((s) => ({ title: s.title, url: s.url, name: s.sourceName })),
        provider: provider.name,
        generatedAt: new Date().toISOString(),
      };

      const status = packet.needsVerification.length && !packet.keyFacts.length ? "needs_review" : "ready";
      const update = await supabase.from("desk_stories").update({
        research_status: status,
        research_packet: packet,
        confirmed_facts: packet.keyFacts,
        unverified_claims: packet.needsVerification,
        updated_at: new Date().toISOString(),
      }).eq("id", data.id);
      if (update.error && /column|schema cache|research_/i.test(update.error.message)) {
        await supabase.from("desk_stories").update({
          confirmed_facts: packet.keyFacts,
          unverified_claims: packet.needsVerification,
          updated_at: new Date().toISOString(),
        }).eq("id", data.id);
      }
      await supabase.from("desk_jobs").insert({
        story_id: data.id,
        stage: "research",
        status: "ok",
        payload: { provider: provider.name, claims: extracted.length },
        finished_at: new Date().toISOString(),
      });
      return { ok: true, status, packet, provider: provider.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Research failed";
      await supabase.from("desk_stories").update({ research_status: "failed", last_error: message }).eq("id", data.id);
      throw new Error(message);
    }
  });
