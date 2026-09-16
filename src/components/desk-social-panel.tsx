import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generateDeskCaption,
  getSocialDeskState,
  proxyDeskImage,
  publishDeskToFacebook,
  saveDeskCaption,
  saveDeskCard,
} from "@/lib/desk/social.functions";
import { renderConnectCard } from "@/lib/desk/card/render-client";
import type { CardRatio } from "@/lib/desk/card/template";
import { formatBanglaDateTime } from "@/lib/bangla";
import { DeskCoverImagePanel } from "@/components/desk-cover-image-panel";

export function DeskSocialPanel({ storyId, articleReady }: { storyId: string; articleReady?: boolean }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getSocialDeskState);
  const saveCard = useServerFn(saveDeskCard);
  const makeCaption = useServerFn(generateDeskCaption);
  const persistCaption = useServerFn(saveDeskCaption);
  const publish = useServerFn(publishDeskToFacebook);
  const proxyImage = useServerFn(proxyDeskImage);
  const social = useQuery({
    queryKey: ["desk-social", storyId],
    queryFn: () => load({ data: { id: storyId } }),
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [support, setSupport] = useState("");
  const [caption, setCaption] = useState("");
  const [ratio, setRatio] = useState<CardRatio>("4:5");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const coverReady = articleReady ?? Boolean(social.data?.articleId);

  useEffect(() => {
    if (!social.data) return;
    setHeadline(social.data.headline);
    setSupport(social.data.support);
    setCaption(social.data.caption);
    setRatio(social.data.cardRatio);
    setPreview(social.data.cardImageUrl);
  }, [social.data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["desk-social", storyId] });
    await queryClient.invalidateQueries({ queryKey: ["desk-story", storyId] });
    await queryClient.invalidateQueries({ queryKey: ["desk-cover", storyId] });
  }

  async function photoSource() {
    if (!social.data?.photoUrl) throw new Error("Add a featured image on the article draft first");
    const base = {
      logoSrc: social.data.template.logoUrl,
      template: social.data.template,
      copy: {
        headline: headline || social.data.headline,
        support: support || social.data.support,
        category: social.data.category,
        dateLabel: social.data.dateLabel,
      },
      ratio,
      requirePhoto: true as const,
    };
    try {
      const dataUrl = await renderConnectCard({ ...base, photoSrc: social.data.photoUrl });
      return { dataUrl };
    } catch {
      const proxied = await proxyImage({ data: { url: social.data.photoUrl } });
      const dataUrl = await renderConnectCard({ ...base, photoSrc: proxied.dataUrl });
      return { dataUrl };
    }
  }

  async function generateCard(persist: boolean) {
    if (!social.data) return;
    setBusy(true);
    try {
      const rendered = await photoSource();
      setPreview(rendered.dataUrl);
      if (!persist) {
        toast.success("Preview ready. It is not saved until you generate/save.");
        return;
      }
      const saved = await saveCard({
        data: {
          id: storyId,
          dataUrl: rendered.dataUrl,
          ratio,
          headline: headline || social.data.headline,
          support: support || social.data.support,
        },
      });
      setPreview(saved.url);
      toast.success("Photo card saved");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Card generation failed");
    } finally {
      setBusy(false);
    }
  }

  if (social.isLoading) {
    return (
      <>
        <DeskCoverImagePanel storyId={storyId} articleReady={coverReady} />
        <p className="text-sm text-muted-foreground">Loading social publishing…</p>
      </>
    );
  }
  if (social.isError || !social.data) {
    return (
      <>
        <DeskCoverImagePanel storyId={storyId} articleReady={coverReady} />
        <p className="text-sm text-destructive">
          {social.error instanceof Error ? social.error.message : "Social tools unavailable"}
        </p>
      </>
    );
  }

  const fb = social.data.facebook;

  return (
    <>
    <DeskCoverImagePanel storyId={storyId} articleReady={coverReady || Boolean(social.data.articleId)} />
    <section className="mb-8 border border-border p-4 text-sm">
      <h2 className="font-serif text-lg font-bold">Social Publishing</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Fixed The Connect template. Text is drawn on the card. Facebook never posts automatically.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          {preview ? (
            <img src={preview} alt="Photo card preview" className="w-full border border-border bg-secondary object-contain" />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center border border-dashed border-border text-xs text-muted-foreground">No card yet</div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {social.data.cardGeneratedAt ? `Saved ${formatBanglaDateTime(social.data.cardGeneratedAt)}` : "Not saved"}
          </p>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">Card headline<input className="mt-1 w-full border border-border bg-background px-3 py-2" value={headline} onChange={(e) => setHeadline(e.target.value)} /></label>
          <label className="block text-xs">Supporting line<input className="mt-1 w-full border border-border bg-background px-3 py-2" value={support} onChange={(e) => setSupport(e.target.value)} /></label>
          <label className="block text-xs">Ratio<select className="mt-1 w-full border border-border bg-background px-3 py-2" value={ratio} onChange={(e) => setRatio(e.target.value as CardRatio)}><option value="4:5">4:5</option><option value="1:1">1:1</option></select></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void generateCard(true)} className="bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60">{social.data.cardImageUrl ? "Regenerate" : "Generate Photo Card"}</button>
            <button type="button" disabled={busy} onClick={() => void generateCard(false)} className="border border-border px-3 py-2 disabled:opacity-60">Preview</button>
            {preview ? <a href={preview} download="the-connect-card.jpg" className="border border-border px-3 py-2">Save image</a> : null}
          </div>
          <label className="block text-xs">Facebook caption<textarea className="mt-1 min-h-28 w-full border border-border bg-background px-3 py-2" value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const out = await makeCaption({ data: { id: storyId } }); setCaption(out.caption); toast.success(`Caption ready \u00b7 ${out.provider}`); await refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Caption failed"); } finally { setBusy(false); } }} className="border border-border px-3 py-2">Generate Caption</button>
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await persistCaption({ data: { id: storyId, caption } }); toast.success("Caption saved"); await refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); } finally { setBusy(false); } }} className="border border-border px-3 py-2">Save caption</button>
          </div>
        </div>
      </div>
      <div className="mt-5 border border-border bg-secondary/40 p-3 text-xs">
        <p><strong>Facebook:</strong> {fb.status}{fb.pageName ? ` \u00b7 ${fb.pageName}` : ""}{fb.pageIdMasked ? ` \u00b7 ${fb.pageIdMasked}` : ""}</p>
        <p className="mt-1">Article URL: {social.data.articleUrl || "Set SITE_URL for a full public link"}</p>
        {fb.postId ? <p className="mt-1">Existing post: {fb.postId}</p> : null}
        {fb.publishedAt ? <p className="mt-1">Published: {formatBanglaDateTime(fb.publishedAt)}</p> : null}
        {fb.error ? <p className="mt-1 text-destructive">{fb.error}</p> : null}
        <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={confirmPublish} onChange={(e) => setConfirmPublish(e.target.checked)} /> I reviewed the card, caption, URL and Page. Publish now.</label>
        <button type="button" disabled={busy || !confirmPublish || !fb.configured || fb.status === "published"} onClick={async () => { setBusy(true); try { const out = await publish({ data: { id: storyId, confirm: true } }); toast.success(`Published to Facebook \u00b7 ${out.postId}`); setConfirmPublish(false); await refresh(); } catch (err) { toast.error(err instanceof Error ? err.message : "Publish failed"); } finally { setBusy(false); } }} className="mt-3 bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">Publish to Facebook</button>
        {!fb.configured ? <p className="mt-2 text-muted-foreground">Set META_ACCESS_TOKEN and META_PAGE_ID on the server, then open Desk Settings.</p> : null}
        {fb.status === "published" ? <p className="mt-2 text-muted-foreground">Already published. Duplicate posts are blocked.</p> : null}
      </div>
    </section>
    </>
  );
}
