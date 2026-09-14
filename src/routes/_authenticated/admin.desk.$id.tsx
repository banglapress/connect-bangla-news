import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getDeskStoryDetail, prepareResearch, saveDeskArticleDepth } from "@/lib/desk/research.functions";
import { generateDeskArticle } from "@/lib/desk/article.functions";
import { addCoverageToStory, findRelatedCoverage, setDiscoveryHitStatus } from "@/lib/desk/discovery.functions";
import { DeskSocialPanel } from "@/components/desk-social-panel";
import { formatBanglaDateTime } from "@/lib/bangla";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/admin/desk/$id")({
  head: () => ({ meta: [{ title: "Story research — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: StoryDetailPage,
});

function scoreValue(value: unknown) {
  const num = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function scoreLabel(value: unknown) {
  return `${Math.round(scoreValue(value) * 100)}%`;
}

function bandLabel(value: unknown) {
  const score = scoreValue(value);
  if (score >= 0.7) return "Highly relevant";
  if (score >= 0.5) return "Relevant";
  if (score >= 0.3) return "Possible";
  return "Low relevance";
}

function StoryDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getDeskStoryDetail);
  const research = useServerFn(prepareResearch);
  const writeArticle = useServerFn(generateDeskArticle);
  const saveDepth = useServerFn(saveDeskArticleDepth);
  const discover = useServerFn(findRelatedCoverage);
  const addHit = useServerFn(addCoverageToStory);
  const setStatus = useServerFn(setDiscoveryHitStatus);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [depth, setDepth] = useState<"brief" | "standard" | "detailed" | "comprehensive">("standard");
  const [depthTouched, setDepthTouched] = useState(false);
  const valid = UUID.test(id);
  const detail = useQuery({
    queryKey: ["desk-story", id],
    enabled: valid,
    retry: false,
    queryFn: async () => load({ data: { id } }),
  });

  const hits = useMemo(() => {
    const rows = (detail.data as any)?.discoveryHits ?? [];
    const list = Array.isArray(rows) ? [...rows] : [];
    return list.sort((a, b) => scoreValue(b.relevance) - scoreValue(a.relevance));
  }, [detail.data]);
  const topHits = hits.slice(0, 8);
  const moreHits = hits.slice(8);

  const selectedIds = Object.entries(selected).filter(([, on]) => on).map(([hitId]) => hitId);

  if (!valid) return <div className="mx-auto max-w-3xl px-4 py-16"><p className="text-destructive">Invalid story ID.</p><a href="/admin/desk" className="mt-4 inline-block text-primary">Back to Story Monitor</a></div>;
  if (detail.isLoading) return <div className="mx-auto max-w-3xl px-4 py-16"><p>Loading story detail…</p><a href="/admin/desk" className="mt-4 inline-block text-sm text-primary">Back to Story Monitor</a></div>;
  if (detail.isError || !detail.data) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><p className="text-destructive">{detail.error instanceof Error ? detail.error.message : "Story not found"}</p><a href="/admin/desk" className="mt-4 inline-block text-primary">Back to Story Monitor</a></div>;
  }

  const { story, sources, claims, facts } = detail.data;
  const packet = story.research_packet;
  const structured = packet?.structured || (packet?.key_facts ? packet : null);
  const articleWarnings = Array.isArray(story.article_warnings) ? story.article_warnings : packet?.warnings || [];
  const researchWarnings = structured?.warnings || packet?.warnings || [];
  const utilization = Array.isArray(story.source_utilization)
    ? story.source_utilization
    : structured?.source_utilization || [];
  const researchQuality = story.research_quality || null;
  const articleQuality = story.article_quality || null;
  const selectedDepth = (depthTouched ? depth : story.article_depth || depth) as typeof depth;

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
              toast.message(`Discovery finished \u00b7 ${out.hits.length} candidates \u00b7 ${out.provider}`);
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
              toast.success("Research packet ready \u00b7 " + out.provider);
              await refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Research failed");
            } finally { setBusy(false); }
          }} className="bg-primary px-4 py-2 text-primary-foreground">Prepare Research</button>
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const out = await writeArticle({ data: { id, depth: selectedDepth } });
              toast.success(out.article.article_status === "needs_review" ? "Draft saved \u00b7 needs review" : "Draft saved \u00b7 " + out.provider);
              await refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Article generation failed");
            } finally { setBusy(false); }
          }} className="border border-border px-4 py-2">{story.article_id ? "Regenerate" : "Generate AI Article"}</button>
          {story.article_id ? <a href={`/admin/${story.article_id}/edit`} className="border border-border px-3 py-2">Open Draft</a> : null}
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
                <p>status: {row.status ?? "no HTTP response"}{row.rateLimited ? " \u00b7 rate_limited" : ""}</p>
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
        <h2 className="font-serif text-lg font-bold">AI Article</h2>
        <p className="mt-2 text-xs text-muted-foreground">One Gemini research call, then one article call from the stored dossier. Draft only. Never auto-published. Longer only when sources support it.</p>
        <div className="mt-3">
          <p className="text-xs font-medium">Article depth</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {(["brief", "standard", "detailed", "comprehensive"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={selectedDepth === option ? "bg-primary px-3 py-1 text-primary-foreground" : "border border-border px-3 py-1"}
                disabled={busy}
                onClick={async () => {
                  setDepth(option);
                  setDepthTouched(true);
                  try {
                    await saveDepth({ data: { id, depth: option } });
                  } catch {
                    /* column may not exist until migration 009 */
                  }
                }}
              >
                {option === "brief" ? "Brief" : option === "standard" ? "Standard" : option === "detailed" ? "Detailed" : "Comprehensive"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Targets only. Thin sources stay short. Changing depth regenerates the article from stored research, not a new research call.</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
          <p>Provider: {story.research_provider || packet?.provider || "not run"}</p>
          <p>Model: {story.article_model || story.research_model || packet?.model || "—"}</p>
          <p>Research status: {story.research_status || "pending"}{packet?.quality ? ` \u00b7 ${packet.quality}` : ""}{structured?.version ? ` \u00b7 v${structured.version}` : ""}</p>
          <p>Article status: {story.article_status || "not generated"}</p>
          <p>Sources: {sources.length} \u00b7 usable content: {utilization.filter((row: any) => row.available_content_level !== "metadata_only").length}</p>
          <p>Word count: {articleQuality?.article_word_count || story.article_word_count || (story.draft_body ? String(story.draft_body).trim().split(/\s+/).length : "—")}</p>
          <p>Generated: {story.article_generated_at ? formatBanglaDateTime(story.article_generated_at) : story.research_generated_at ? formatBanglaDateTime(story.research_generated_at) : "—"}</p>
          <p>Depth: {selectedDepth}</p>
        </div>
        {utilization.length ? (
          <div className="mt-4 border border-border p-3">
            <p className="font-medium">Source Utilization</p>
            <div className="mt-2 space-y-2 text-xs">
              {utilization.map((row: any) => (
                <div key={row.source_row_id || row.url}>
                  <p className="font-medium">{row.name || row.url}</p>
                  <p className="text-muted-foreground">
                    content: {row.available_content_level || "metadata_only"}
                    {` \u00b7 facts extracted: ${row.facts_extracted ?? 0}`}
                    {` \u00b7 unique details: ${row.unique_facts ?? 0}`}
                    {` \u00b7 quotes: ${row.quotes_extracted ?? 0}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {researchQuality ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
            <p>Research facts: {researchQuality.facts ?? "—"}</p>
            <p>Unique details: {researchQuality.unique_details ?? "—"}</p>
            <p>Quotes: {researchQuality.quotes ?? "—"}</p>
            <p>Conflicts: {researchQuality.conflicts ?? "—"}</p>
          </div>
        ) : null}
        {researchWarnings.length || articleWarnings.length ? (
          <div className="mt-3 space-y-1 border border-border bg-secondary/40 p-3">
            {[...researchWarnings, ...articleWarnings].map((row: any, index: number) => (
              <p key={`${row.code}-${index}`} className="text-sm">{row.message || row}</p>
            ))}
          </div>
        ) : null}
        {story.draft_title ? (
          <div className="mt-4">
            <p className="font-medium">{story.draft_title}</p>
            {story.draft_excerpt ? <p className="mt-1 text-muted-foreground">{story.draft_excerpt}</p> : null}
            {story.seo_title ? <p className="mt-2 text-xs">SEO title: {story.seo_title}</p> : null}
            {story.meta_description ? <p className="text-xs">Meta: {story.meta_description}</p> : null}
            {story.draft_body ? <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed line-clamp-8">{story.draft_body}</p> : null}
          </div>
        ) : null}
      </section>

      <DeskSocialPanel storyId={id} />

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
          {hits.length === 0 ? <p className="py-2 text-muted-foreground">No related coverage saved yet. Run Find Related Coverage.</p> : topHits.map((hit: any) => (
            <div key={hit.id || hit.url} className="flex flex-wrap items-start gap-3 py-3">
              <input type="checkbox" className="mt-1" checked={!!selected[hit.id]} onChange={(event) => setSelected((current) => ({ ...current, [hit.id]: event.target.checked }))} disabled={!hit.id || hit.status === "ignored"} />
              <div className="min-w-0 flex-1">
                <a href={hit.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{hit.title}</a>
                <p className="text-xs text-muted-foreground">
                  {hit.domain || "unknown source"}
                  {hit.published_at ? ` \u00b7 ${formatBanglaDateTime(hit.published_at)}` : ""}
                  {` \u00b7 ${scoreLabel(hit.relevance)} \u00b7 `}
                  <span className={scoreValue(hit.relevance) >= 0.7 ? "font-semibold text-foreground" : ""}>{bandLabel(hit.relevance)}</span>
                  {hit.status ? ` \u00b7 ${hit.status}` : ""}
                  {hit.provider ? ` \u00b7 ${hit.provider}` : ""}
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
          {moreHits.length ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">More candidates ({moreHits.length})</summary>
              <div className="mt-2 divide-y divide-border">
                {moreHits.map((hit: any) => (
                  <div key={`more-${hit.id || hit.url}`} className="flex flex-wrap items-start gap-3 py-3">
                    <input type="checkbox" className="mt-1" checked={!!selected[hit.id]} onChange={(event) => setSelected((current) => ({ ...current, [hit.id]: event.target.checked }))} disabled={!hit.id || hit.status === "ignored"} />
                    <div className="min-w-0 flex-1">
                      <a href={hit.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{hit.title}</a>
                      <p className="text-xs text-muted-foreground">{hit.domain || "unknown source"}{` \u00b7 ${scoreLabel(hit.relevance)} \u00b7 ${bandLabel(hit.relevance)}`}{hit.status ? ` \u00b7 ${hit.status}` : ""}</p>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <button type="button" className="text-primary" disabled={busy || hit.status === "added"} onClick={async () => { try { await addOne(hit); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not add"); } }}>{hit.status === "added" ? "Added" : "Add to story"}</button>
                      <button type="button" className="text-muted-foreground" disabled={busy || hit.status === "ignored"} onClick={() => ignoreIds([hit.id])}>Ignore</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
      </section>

      <section className="mb-8 border border-border p-4 text-sm">
        <h2 className="font-serif text-lg font-bold">Story Cluster</h2>
        <p className="mt-2">Sources: {sources.length} \u00b7 Research: {story.research_status || "pending"}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {sources.map((src: any) => {
            const util = utilization.find((row: any) => row.source_row_id === src.id);
            const chars = String(src.raw_text || src.excerpt || "").trim().length;
            const level = util?.available_content_level || (chars >= 1500 ? "full" : chars >= 220 ? "partial" : "metadata_only");
            return (
              <li key={src.id}>
                <a className="text-primary hover:underline" href={src.url} target="_blank" rel="noreferrer">{src.title || src.url}</a>
                <span className="text-xs text-muted-foreground"> \u00b7 {level === "full" ? "Full content available" : level === "partial" ? "Partial content" : "Metadata only"}</span>
              </li>
            );
          })}
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
          <p className="mt-1 text-xs text-muted-foreground">{packet.provider}{packet.model ? ` \u00b7 ${packet.model}` : ""}{packet.quality ? ` \u00b7 ${packet.quality}` : ""}</p>
          <p className="mt-2"><strong>Executive summary:</strong> {structured?.executive_summary || packet.whatHappened || structured?.summary}</p>
          <p className="mt-2"><strong>What happened:</strong> {structured?.what_happened || packet.whatHappened || structured?.summary}</p>
          {structured?.unique_details?.length ? (
            <div className="mt-3">
              <p className="font-medium">Unique source details</p>
              <ul className="mt-1 list-disc pl-5">{structured.unique_details.map((row: any) => <li key={row.text}>{row.text}</li>)}</ul>
            </div>
          ) : null}
          {structured?.important_quotes?.length ? (
            <div className="mt-3">
              <p className="font-medium">Direct quotes</p>
              <ul className="mt-1 list-disc pl-5">{structured.important_quotes.map((row: any) => <li key={row.quote}>{row.speaker ? `${row.speaker}: ` : ""}“{row.quote}”</li>)}</ul>
            </div>
          ) : null}
          {structured?.timeline?.length ? (
            <div className="mt-3">
              <p className="font-medium">Chronology</p>
              <ul className="mt-1 list-disc pl-5">{structured.timeline.map((row: any) => <li key={`${row.time}-${row.text}`}>{row.time ? `${row.time} — ` : ""}{row.text}</li>)}</ul>
            </div>
          ) : null}
          {packet.keyFacts?.length ? (
            <div className="mt-3">
              <p className="font-medium">Multi-source supported (not automatically verified)</p>
              <ul className="mt-1 list-disc pl-5">{packet.keyFacts.map((row: string) => <li key={row}>{row}</li>)}</ul>
            </div>
          ) : null}
          {packet.conflicts?.length ? (
            <div className="mt-3">
              <p className="font-medium">⚠ Conflicting information</p>
              <ul className="mt-1 list-disc pl-5">{packet.conflicts.map((row: string) => <li key={row}>{row}</li>)}</ul>
            </div>
          ) : null}
          {packet.needsVerification?.length ? (
            <div className="mt-3">
              <p className="font-medium">⚠ Needs verification / single-source</p>
              <ul className="mt-1 list-disc pl-5">{packet.needsVerification.map((row: string) => <li key={row}>{row}</li>)}</ul>
            </div>
          ) : null}
          <div className="mt-3">
            <p className="font-medium">Source links</p>
            <ul className="mt-1 list-disc pl-5">
              {(packet.sourceLinks || sources).map((row: any) => (
                <li key={row.url || row.id}>
                  <a className="text-primary hover:underline" href={row.url} target="_blank" rel="noreferrer">{row.name || row.title || row.url}</a>
                  {row.title && row.name ? ` — ${row.title}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
