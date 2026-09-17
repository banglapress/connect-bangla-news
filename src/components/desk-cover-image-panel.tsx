import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  generateDeskCoverImage,
  listDeskCoverImages,
  prepareDeskCoverPrompt,
  reuseDeskCoverImage,
  selectDeskCoverImage,
} from "@/lib/desk/cover-image.functions";
import { composeCoverWithLogo, composeSocialCover, SITE_LOGO_SRC } from "@/lib/desk/cover-compose";
import { proxyDeskImage } from "@/lib/desk/social.functions";

export function DeskCoverImagePanel({ storyId, articleReady, onApplied }: { storyId: string; articleReady: boolean; onApplied?: (url: string) => void }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listDeskCoverImages);
  const preparePrompt = useServerFn(prepareDeskCoverPrompt);
  const generate = useServerFn(generateDeskCoverImage);
  const select = useServerFn(selectDeskCoverImage);
  const reuse = useServerFn(reuseDeskCoverImage);
  const proxyImage = useServerFn(proxyDeskImage);
  const state = useQuery({
    queryKey: ["desk-cover", storyId],
    queryFn: () => load({ data: { id: storyId } }),
  });
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    const saved = state.data?.coverPrompt || "";
    if (!promptDirty && saved && saved !== prompt) setPrompt(saved);
    if (!saved && !promptDirty && prompt) setPrompt("");
  }, [state.data?.coverPrompt, prompt, promptDirty]);

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

  async function handlePreparePrompt() {
    if (!articleReady) {
      toast.error("আগে খবরের AI article তৈরি করুন");
      return;
    }
    setBusy(true);
    try {
      const out = await preparePrompt({ data: { id: storyId } });
      setPrompt(out.prompt);
      setPromptDirty(false);
      toast.success("কভার প্রম্পট তৈরি হয়েছে · এখন আপনি চাইলে সম্পাদনা করুন");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কভার প্রম্পট তৈরি করা যায়নি");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateImage() {
    if (!articleReady) {
      toast.error("আগে খবরের AI article তৈরি করুন");
      return;
    }
    const approvedPrompt = prompt.trim();
    if (approvedPrompt.length < 30) {
      toast.error("আগে কভার প্রম্পট তৈরি/সম্পাদনা করে অন্তত ৩০ অক্ষরের একটি প্রম্পট অনুমোদন করুন");
      return;
    }
    setBusy(true);
    try {
      const out = await generate({ data: { id: storyId, prompt: approvedPrompt } });
      setPromptDirty(false);
      toast.success("কভার ইমেজ তৈরি হয়েছে · " + (out.modelLabel || out.model));
      await refresh();
      await makePreview(out.imageUrl, out.id || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কভার ইমেজ তৈরি করা যায়নি");
    } finally {
      setBusy(false);
    }
  }

  async function handleUse() {
    if (!preview && !state.data?.images?.[0]?.image_url) {
      toast.error("আগে একটি কভার ইমেজ নির্বাচন করুন");
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
      toast.success("কভার ইমেজটি article-এর featured image হিসেবে বসানো হয়েছে");
      if (applied?.imageUrl) onApplied?.(applied.imageUrl);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "কভার ইমেজ বসানো যায়নি");
    } finally {
      setBusy(false);
    }
  }

  const images = state.data?.images || [];
  const reusable = state.data?.reusable || [];
  const hasPrompt = prompt.trim().length >= 30;

  return (
    <section className="mb-8 border border-border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-bold">Article cover image</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            প্রথমে AI শুধু ভিজ্যুয়াল প্রম্পট তৈরি করবে। আপনি প্রম্পট দেখে/এডিট করে অনুমোদন দিলে তারপর ইমেজ তৈরি হবে। একই cover image website ও Facebook-এর জন্য ব্যবহার হবে।
          </p>
        </div>
        <span className="border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {state.data?.modelLabel || "AI-generated cover image"}
        </span>
      </div>
      {state.data?.migrationNeeded ? (
        <p className="mt-3 text-destructive">Cover image database migration চালান, তারপর আবার চেষ্টা করুন।</p>
      ) : null}
      {!articleReady ? <p className="mt-3 text-xs text-muted-foreground">আগে AI article তৈরি করুন।</p> : null}
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
          বর্তমান featured image বদলাতে চাই
        </label>
      ) : null}

      <div className="mt-4 border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">ধাপ ১ — কভার প্রম্পট</p>
            <p className="text-xs text-muted-foreground">প্রম্পটে কোনো text/logo থাকবে না। আপনি এখানে wording বদলাতে পারবেন।</p>
          </div>
          <button
            type="button"
            disabled={busy || !articleReady}
            onClick={() => void handlePreparePrompt()}
            className="border border-border px-4 py-2 text-xs disabled:opacity-60"
          >
            {busy && !hasPrompt ? "প্রম্পট তৈরি হচ্ছে…" : prompt ? "নতুন প্রম্পট তৈরি করুন" : "প্রম্পট তৈরি করুন"}
          </button>
        </div>
        {prompt ? (
          <textarea
            className="mt-3 min-h-40 w-full border border-border p-3 text-sm leading-6"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setPromptDirty(true);
            }}
            placeholder="এখানে approved cover prompt থাকবে…"
          />
        ) : null}
        {prompt ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {promptDirty ? "আপনার সম্পাদনা সংরক্ষণ করে তারপর ছবি তৈরি হবে।" : "প্রম্পট প্রস্তুত। ছবি তৈরির আগে আবার দেখে নিন।"}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !articleReady || !hasPrompt}
          onClick={() => void handleGenerateImage()}
          className="bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
        >
          {busy && hasPrompt ? "ইমেজ তৈরি হচ্ছে…" : "প্রম্পট Approve & Generate Image"}
        </button>
        <button type="button" disabled={busy || !hasPrompt} onClick={() => void handleGenerateImage()} className="border border-border px-4 py-2 disabled:opacity-60">
          একই Prompt-এ আবার Image
        </button>
        <button type="button" disabled={busy || !articleReady} onClick={() => void handlePreparePrompt()} className="border border-border px-4 py-2 disabled:opacity-60">
          নতুন Prompt
        </button>
        <button type="button" disabled={busy || !preview} onClick={() => void handleUse()} className="border border-border px-4 py-2 disabled:opacity-60">
          Use This Image
        </button>
      </div>

      {preview ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">Preview · real site logo is added at bottom-left by the app</p>
          <img src={preview} alt="" className="max-h-72 w-full object-cover" />
        </div>
      ) : state.data?.articleImageUrl ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">বর্তমান featured image</p>
          <img src={state.data.articleImageUrl} alt="" className="max-h-48 w-full object-cover" />
        </div>
      ) : null}

      {images.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium">এই article-এর generated covers</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {images.map((row: any) => (
              <button
                key={row.id}
                type="button"
                className={`border p-2 text-left ${row.is_selected || row.id === state.data?.selectedId ? "border-primary" : "border-border"}`}
                onClick={() => row.image_url && void makePreview(row.image_url, row.id)}
              >
                {row.image_url ? <img src={row.image_url} alt="" className="mb-2 h-24 w-full object-cover" /> : null}
                <p className="text-[11px]">{row.generation_status}{row.provider ? ` · ${row.provider}` : ""}</p>
                {row.error_message ? <p className="text-[11px] text-destructive">{row.error_message}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reusable.length ? (
        <div className="mt-4">
          <p className="text-xs font-medium">আগের uploaded/Cloudinary image</p>
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
                    toast.success("আগের image-টি featured cover হিসেবে ব্যবহার করা হয়েছে");
                    await refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Image reuse করা যায়নি");
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
