import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getDeskStoryDetail, prepareResearch } from "@/lib/desk/research.functions";
import { addCoverageToStory, findRelatedCoverage, setDiscoveryHitStatus } from "@/lib/desk/discovery.functions";
import { formatBanglaDateTime } from "@/lib/bangla";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/admin/desk/$id")({
  head: () => ({ meta: [{ title: "Story research — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: StoryDetailPage,
});

function scoreLabel(value: unknown) {
  const num = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

function StoryDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getDeskStoryDetail);
  const research = useServerFn(prepareResearch);
  const discover = useServerFn(findRelatedCoverage);
  const addHit = useServerFn(addCoverageToStory);
  const setStatus = useServerFn(setDiscoveryHitStatus);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const valid = UUID.test(id);
  const detail = useQuery({
    queryKey: ["desk-story", id],
    enabled: valid,
    retry: false,
    queryFn: async () => load({ data: { id } }),
  });

  const hits = useMemo(() => {
    const rows = (detail.data as any)?.discoveryHits ?? [];
    return Array.isArray(rows) ? rows : [];
  }, [detail.data]);

  const selectedIds = Object.entries(selected).filter(([, on]) => on).map(([hitId]) => hitId);

  if (!valid) return <div className="mx-auto max-w-3xl px-4 py-16"><p className="text-destructive">Invalid story ID.</p><a href="/admin/desk" className="mt-4 inline-block text-primary">Back to Story Monitor</a></div>;
  if (detail.isLoading) return <div className="mx-auto max-w-3xl px-4 py-16"><p>Loading story detail…</p><a href="/admin/desk" className="mt-4 inline-block text-sm text-primary">Back to Story Monitor</a></div>;
  if (detail.isError || !detail.data) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><p className="text-destructive">{detail.error instanceof Error ? detail.error.message : "Story not found"}</p><a href="/admin/desk" className="mt-4 inline-block text-primary">Back to Story Monitor</a></div>;
  }

  const { story, sources, claims, facts } = detail.data;
  const packet = story.research_packet;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["desk-story", id] });
  }

  async function addOne(hit: any) {
    const out = await addHit({
      data: {
        storyId: id,
        title: hit.title,
        url: hit.url,
        publishedAt: hit.published_at ?? hit.publishedAt ?? null,
        excerpt: hit.snippet ?? null,
        hitId: hit.id,
      },
    });
    toast.success(out.duplicate ? "Already on this story" : "Added to story");
    await refresh();
  }

  async function ignoreIds(hitIds: string[]) {
    if (!hitIds.length) return;
    await setStatus({ data: { storyId: id, hitIds, status: "ignored" } });
    toast.message("Ignored selected coverage");
    setSelected({});
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule mb-6 flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">{story.title_hint}</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            setDiscoverError(null);
            try {
              const out = await discover({ data: { storyId: id } });
              setDiagnostics(out.diagnostics ?? []);
              const failed = (out.diagnostics ?? []).find((row: any) => row.error);
              if (failed) setDiscoverError(failed.error);
              toast.message(`Discovery finished · ${out.hits.length} candidates · ${out.provider}`);
              await refresh();
            } catch (err) {
              const message = err instanceof Error ? err.message : "Discovery failed";
              setDiscoverError(message);
              setDiagnostics([{ label: "request", query: "", requestUrl: "", provider: "google_news", status: null, resultCount: 0, durationMs: 0, error: message, bodyPreview: null }]);
              toast.error(message);
            } finally { setBusy(false); }
          }} className="border border-border px-4 py-2">{busy ? "Searching…" : "Find Related Coverage"}</button>
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const out = await research({ data: { id } });
              toast.success("Research packet ready · " + out.provider);
              await refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Research failed");
            } finally { setBusy(false); }
          }} className="bg-primary px-4 py-2 text-primary-foreground">Prepare Research</button>
          <a href="/admin/desk" className="border border-border px-3 py-2">Back to Story Monitor</a>
        </div>
      </div>

      {diagnostics ? (
        <section className="mb-8 border border-border p-4 text-sm">
          <h2 className="font-serif text-lg font-bold">Discovery request</h2>
          {discoverError ? <p className="mt-2 text-destructive">{discoverError}</p> : null}
          <div className="mt-3 space-y-3">
            {diagnostics.map((row: any) => (
              <div key={`${row.label}-${row.query}`} className="border border-border p-3 text-xs">
                <p className="font-medium">{row.label}</p>
                <p>provider: {row.provider}</p>
                <p>query: {row.query}</p>
                <p className="break-all">url: {row.requestUrl}</p>
                <p>status: {row.status ?? "no HTTP response"}{row.rateLimited ? " · rate_limited" : ""}</p>
                <p>result count: {row.resultCount}</p>
                <p>duration: {row.durationMs} ms</p>
                <p>error: {row.error || "none"}</p>
                {row.bodyPreview ? <p className="mt-1 text-muted-foreground">body: {row.bodyPreview}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-8 border border-border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-bold">Related coverage</h2>
            <p className="mt-1 text-xs text-muted-foreground">Candidates only. Not trusted facts. Status persists after reload.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" className="border border-border px-3 py-1" disabled={!selectedIds.length || busy} onClick={async () => {
              setBusy(true);
              try {
                const chosen = hits.filter((hit: any) => selected[hit.id]);
                for (const hit of chosen) await addOne(hit);
                setSelected({});
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not add selected");
              } finally { setBusy(false); }
            }}>Add selected</button>
            <button type="button" className="border border-border px-3 py-1" disabled={!selectedIds.length || busy} onClick={() => ignoreIds(selectedIds)}>Ignore selected</button>
          </div>
        </div>
        <div className="mt-3 divide-y divide-border">
          {hits.length === 0 ? <p className="py-2 text-muted-foreground">No related coverage saved yet. Run Find Related Coverage.</p> : hits.map((hit: any) => (
            <div key={hit.id || hit.url} className="flex flex-wrap items-start gap-3 py-3">
              <input type="checkbox" className="mt-1" checked={!!selected[hit.id]} onChange={(event) => setSelected((current) => ({ ...current, [hit.id]: event.target.checked }))} disabled={!hit.id || hit.status === "ignored"} />
              <div className="min-w-0 flex-1">
                <a href={hit.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{hit.title}</a>
                <p className="text-xs text-muted-foreground">
                  {hit.domain || "unknown source"}
                  {hit.published_at ? ` · ${formatBanglaDateTime(hit.published_at)}` : ""}
                  {` · relevance ${scoreLabel(hit.relevance)}`}
                  {hit.status ? ` · ${hit.status}` : ""}
                  {hit.provider ? ` · ${hit.provider}` : ""}
                </p>
                {hit.snippet ? <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{hit.snippet}</p> : null}
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" className="text-primary" disabled={busy || hit.status === "added"} onClick={async () => {
                  try { await addOne(hit); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not add"); }
                }}>{hit.status === "added" ? "Added" : "Add to story"}</button>
                <button type="button" className="text-muted-foreground" disabled={busy || hit.status === "ignored"} onClick={() => ignoreIds([hit.id])}>Ignore</button>
              </div>
            </div>
          ))}
        </div>
      </section>

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
              <p className="text-xs text-muted-foreground">{src.published_at ? formatBanglaDateTime(src.published_at) : "No time"}</p>
              <a className="text-xs text-primary" href={src.url} target="_blank" rel="noreferrer">{src.url}</a>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {claims.filter((c: any) => c.source_row_id === src.id).map((c: any) => <li key={c.id}>{c.claim_text}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="section-rule pb-1 font-serif text-lg font-bold">Fact Matrix</h2>
        <div className="mt-3 divide-y divide-border border border-border text-sm">
          {facts.length === 0 ? <p className="p-3 text-muted-foreground">Run Prepare Research.</p> : facts.map((fact: any) => (
            <div key={fact.id} className="p-3"><p>{fact.fact_text}</p><p className="text-xs text-muted-foreground">{fact.status}</p></div>
          ))}
        </div>
      </section>

      {packet ? (
        <section className="border border-border p-4 text-sm">
          <h2 className="font-serif text-lg font-bold">Research Packet</h2>
          <p className="mt-2"><strong>What happened:</strong> {packet.whatHappened}</p>
        </section>
      ) : null}
    </div>
  );
}
