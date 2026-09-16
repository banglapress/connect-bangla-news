import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generateDeskCoverImage,
  listDeskCoverImages,
  reuseDeskCoverImage,
  selectDeskCoverImage,
} from "@/lib/desk/cover-image.functions";
import { composeCoverWithLogo, composeSocialCover, SITE_LOGO_SRC } from "@/lib/desk/cover-compose";
import { proxyDeskImage } from "@/lib/desk/social.functions";

export function DeskCoverImagePanel({ storyId, articleReady, onApplied }: { storyId: string; articleReady: boolean; onApplied?: (url: string) => void }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listDeskCoverImages);
  const generate = useServerFn(generateDeskCoverImage);
  const select = useServerFn(selectDeskCoverImage);
  const reuse = useServerFn(reuseDeskCoverImage);
  const proxyImage = useServerFn(proxyDeskImage);
  const state = useQuery({
    queryKey: ["desk-cover", storyId],
    queryFn: () => load({ data: { id: storyId } }),
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["desk-cover", storyId] });
    await queryClient.invalidateQueries({ queryKey: ["desk-story", storyId] });
    await queryClient.invalidateQueries({ queryKey: ["desk-social", storyId] });
  }

  async function photoSrc(url: string) {
    try {
      await composeCoverWithLogo({ photoSrc: url, logoSrc: SITE_LOGO_SRC });
      return url;
    } catch {
      const proxied = await proxyImage({ data: { url } });
      return proxied.dataUrl;
    }
  }

  async function makePreview(url: string, id?: string | null) {
    const src = await photoSrc(url);
    const composed = await composeCoverWithLogo({ photoSrc: src, logoSrc: SITE_LOGO_SRC });
    setPreview(composed);
    setPreviewId(id || null);
    return composed;
  }

  async function handleGenerate() {
    if (!articleReady) {
      toast.error("Generate the article first");
      return;
    }
    setBusy(true);
    try {
      const out = await generate({ data: { id: storyId } });
      toast.success("Cover image generated \u00b7 " + (out.modelLabel || out.model));
      await refresh();
      await makePreview(out.imageUrl, out.id || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUse() {
    if (!preview && !state.data?.images?.[0]?.image_url) {
      toast.error("Generate or select a cover first");
      return;
    }
    setBusy(true);
    try {
      const latest = previewId || state.data?.images?.find((row: any) => row.generation_status === "ok")?.id;
      const sourceUrl =
        state.data?.images?.find((row: any) => row.id === latest)?.image_url || state.data?.images?.[0]?.image_url;
      const composed = preview || (sourceUrl ? await makePreview(sourceUrl, latest) : null);
      if (!composed) throw new Error("No composed cover to save");
      const social = sourceUrl ? await composeSocialCover(await photoSrc(sourceUrl), SITE_LOGO_SRC) : composed;
      const applied = await select({
        data: {
          id: storyId,
          imageId: latest,
          composedDataUrl: composed,
          composedSocialDataUrl: social,
          replaceExisting,
        },
      });
      toast.success("Cover sent to the article draft featured image");
      if (applied?.imageUrl) onApplied?.(applied.imageUrl);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply cover image");
    } finally {
      setBusy(false);
    }
  }

  const images = state.data?.images || [];
  const reusable = state.data?.reusable || [];

  return (
    <section className="mb-8 border border-border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-bold">Article cover image</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One editorial visual from the article. The same image is cropped for Facebook. Logo is the real site mark, added after generation.
          </p>
        </div>
        <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {state.data?.modelLabel || "AI-generated cover image"}
        </span>
      </div>
      {state.data?.migrationNeeded ? (
        <p className="mt-3 text-destructive">Run migration 010_cover_images.sql so cover generations can be stored.</p>
      ) : null}
      {!articleReady ? (
        <p className="mt-3 text-xs text-muted-foreground">Generate the AI article first. You can also generate the cover from the draft editor after opening the draft.</p>
      ) : null}
      {!state.data?.configured ? (
        <p className="mt-3 text-destructive">
          {state.data?.provider === "gemini"
            ? "GEMINI_API_KEY is not configured on the server."
            : "Cloudflare cover credentials missing. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."}
        </p>
      ) : null}
      {state.data?.hasManualImage ? (
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          Replace the existing featured image on this draft
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !articleReady || state.data?.generating}
          onClick={handleGenerate}
          className="bg-primary px-4 py-2 text-primary-foreground"
        >
          {state.data?.generating || busy ? "Generating\u2026" : "Generate Article Cover Image"}
        </button>
        <button type="button" disabled={busy || !preview} onClick={handleUse} className="border border-border px-4 py-2">
          Use This Image
        </button>
        <button type="button" disabled={busy || !articleReady} onClick={handleGenerate} className="border border-border px-4 py-2">
          Regenerate
        </button>
      </div>
      {preview ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">Preview with site logo (bottom left)</p>
          <img src={preview} alt="" className="max-h-72 w-full object-cover" />
        </div>
      ) : state.data?.articleImageUrl ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">Current featured image</p>
          <img src={state.data.articleImageUrl} alt="" className="max-h-48 w-full object-cover" />
        </div>
      ) : null}
      {images.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium">Generated for this article</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {images.map((row: any) => (
              <button
                key={row.id}
                type="button"
                className={`border p-2 text-left ${row.is_selected || row.id === state.data?.selectedId ? "border-primary" : "border-border"}`}
                onClick={() => row.image_url && makePreview(row.image_url, row.id)}
              >
                {row.image_url ? <img src={row.image_url} alt="" className="mb-2 h-24 w-full object-cover" /> : null}
                <p className="text-[11px]">{row.generation_status}{row.provider ? ` \u00b7 ${row.provider}` : ""}</p>
                {row.error_message ? <p className="text-[11px] text-destructive">{row.error_message}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {reusable.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium">Reuse a previous Cloudinary / uploaded image</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            {reusable.map((row: any) => (
              <button
                key={row.id || row.url}
                type="button"
                className="border border-border p-2"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await reuse({ data: { id: storyId, imageUrl: row.url, replaceExisting } });
                    toast.success("Reused existing image as featured cover");
                    await refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not reuse image");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <img src={row.url} alt="" className="h-20 w-full object-cover" />
                <p className="mt-1 text-[11px] text-muted-foreground">{row.source_type}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
