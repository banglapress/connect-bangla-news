import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getDeskStoryDetail, prepareResearch } from "@/lib/desk/research.functions";
import { formatBanglaDateTime } from "@/lib/bangla";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/admin/desk/$id")({
  head: () => ({ meta: [{ title: "Story research — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: StoryDetailPage,
});

function StoryDetailPage() {
  const params = Route.useParams();
  const id = params.id;
  const queryClient = useQueryClient();
  const load = useServerFn(getDeskStoryDetail);
  const research = useServerFn(prepareResearch);
  const [busy, setBusy] = useState(false);
  const valid = UUID.test(id);
  const detail = useQuery({
    queryKey: ["desk-story", id],
    enabled: valid,
    retry: false,
    queryFn: async () => {
      try {
        return await load({ data: { id } });
      } catch (err) {
        console.error("desk story detail failed", id, err);
        throw err;
      }
    },
  });

  async function prepare() {
    setBusy(true);
    try {
      const out = await research({ data: { id } });
      toast.success("Research packet ready · " + out.provider);
      await queryClient.invalidateQueries({ queryKey: ["desk-story", id] });
    } catch (err) {
      console.error("prepare research failed", id, err);
      toast.error(err instanceof Error ? err.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }

  if (!valid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-destructive">Invalid story ID.</p>
        <a href="/admin/desk" className="mt-4 inline-block text-primary hover:underline">Back to Story Monitor</a>
      </div>
    );
  }

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p>Loading story detail…</p>
        <a href="/admin/desk" className="mt-4 inline-block text-sm text-primary hover:underline">Back to Story Monitor</a>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    const message = detail.error instanceof Error ? detail.error.message : "Story not found";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-destructive">{message}</p>
        <a href="/admin/desk" className="mt-4 inline-block text-primary hover:underline">Back to Story Monitor</a>
      </div>
    );
  }

  const { story, sources, claims, facts } = detail.data;
  const packet = story.research_packet;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule mb-6 flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">{story.title_hint}</h1>
        <div className="flex gap-3 text-sm">
          <button type="button" disabled={busy} onClick={() => void prepare()} className="bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60">
            {busy ? "Preparing…" : "Prepare Research"}
          </button>
          <a href="/admin/desk" className="border border-border px-3 py-2">Back to Story Monitor</a>
        </div>
      </div>

      <section className="mb-8 border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-bold">Story Cluster</h2>
        <p className="mt-2">Sources: {sources.length} · Research: {story.research_status || "pending"}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {sources.map((src: any) => (
            <li key={src.id}><a className="text-primary hover:underline" href={src.url} target="_blank" rel="noreferrer">{src.title || src.url}</a></li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="section-rule pb-1 font-serif text-lg font-bold">Source Comparison</h2>
        <div className="mt-3 divide-y divide-border border border-border text-sm">
          {sources.map((src: any) => (
            <div key={src.id} className="p-3">
              <p className="font-medium">{src.title}</p>
              <p className="text-xs text-muted-foreground">{src.published_at ? formatBanglaDateTime(src.published_at) : "No time"} · fetched {src.fetched_at ? formatBanglaDateTime(src.fetched_at) : "—"}</p>
              <a className="text-xs text-primary" href={src.url} target="_blank" rel="noreferrer">{src.url}</a>
              <p className="mt-2 text-xs">{src.excerpt || src.raw_text}</p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {claims.filter((c: any) => c.source_row_id === src.id).map((c: any) => (
                  <li key={c.id}>{c.claim_text} <span className="text-muted-foreground">({c.claim_type})</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="section-rule pb-1 font-serif text-lg font-bold">Fact Matrix</h2>
        <div className="mt-3 divide-y divide-border border border-border text-sm">
          {facts.length === 0 ? <p className="p-3 text-muted-foreground">Run Prepare Research.</p> : facts.map((fact: any) => (
            <div key={fact.id} className="p-3">
              <p>{fact.fact_text}</p>
              <p className="text-xs text-muted-foreground">{fact.status} · supporting {fact.supporting_source_ids?.length ?? 0} · conflicting {fact.conflicting_source_ids?.length ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      {packet ? (
        <section className="border border-border p-4 text-sm">
          <h2 className="font-serif text-lg font-bold">Research Packet</h2>
          <p className="mt-2"><strong>What happened:</strong> {packet.whatHappened}</p>
          <p className="mt-2"><strong>Key facts</strong></p>
          <ul className="list-disc pl-5">{(packet.keyFacts ?? []).map((item: string) => <li key={item}>{item}</li>)}</ul>
          <p className="mt-2"><strong>Needs verification</strong></p>
          <ul className="list-disc pl-5">{(packet.needsVerification ?? []).map((item: string) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
