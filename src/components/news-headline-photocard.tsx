import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Facebook, ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { publishHeadlinePhotocard } from "@/lib/desk/social.photocard";

declare global {
  interface Window {
    html2canvas?: (
      element: HTMLElement,
      options?: Record<string, unknown>,
    ) => Promise<HTMLCanvasElement>;
  }
}

type Corner = "top-right" | "bottom-left" | "bottom-right";

const CATEGORIES = ["জাতীয়", "রাজনীতি", "অর্থনীতি", "ব্রেকিং", "আন্তর্জাতিক", "খেলা", "বিনোদন", "প্রযুক্তি"];

async function getHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PNG তৈরির লাইব্রেরি লোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"));
    document.head.appendChild(script);
  });

  if (!window.html2canvas) throw new Error("PNG তৈরির লাইব্রেরি চালু হয়নি। আবার চেষ্টা করুন।");
  return window.html2canvas;
}

function CornerMark({ corner }: { corner: Corner }) {
  const isTop = corner === "top-right";
  const isLeft = corner === "bottom-left";
  const frame: CSSProperties = {
    position: "absolute",
    width: 32,
    height: 32,
    pointerEvents: "none",
    zIndex: 5,
    ...(isTop ? { right: 32, top: 28 } : isLeft ? { left: 32, bottom: 32 } : { right: 32, bottom: 32 }),
  };
  const horizontal: CSSProperties = {
    position: "absolute",
    width: "100%",
    height: 5,
    background: "#FF5A1A",
    ...(isTop ? { right: 0, top: 0 } : { bottom: 0, ...(isLeft ? { left: 0 } : { right: 0 }) }),
  };
  const vertical: CSSProperties = {
    position: "absolute",
    width: 5,
    height: "100%",
    background: "#FF5A1A",
    ...(isTop ? { right: 0, top: 0 } : { bottom: 0, ...(isLeft ? { left: 0 } : { right: 0 }) }),
  };

  return (
    <div aria-hidden="true" style={frame}>
      <div style={horizontal} />
      <div style={vertical} />
    </div>
  );
}

function SocialLink({ kind, children }: { kind: "facebook" | "youtube"; children: string }) {
  const facebook = kind === "facebook";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7A7E86", fontWeight: 500 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: facebook ? "#1877F2" : "#FF0000",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: facebook ? 9 : 8,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {facebook ? "f" : "▶"}
      </span>
      {children}
    </div>
  );
}

export function NewsHeadlinePhotocard() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [headline, setHeadline] = useState("ব্যাংকের খেলাপি ঋণ ৬ লাখ কোটি টাকা ছাড়াল");
  const [support, setSupport] = useState("মোট ঋণের ৩২.৭৮ শতাংশ খেলাপি।");
  const [category, setCategory] = useState("অর্থনীতি");
  const [location, setLocation] = useState("ঢাকা");
  const [dateLabel, setDateLabel] = useState("৩ সেপ্টেম্বর ২০২৫");
  const [source, setSource] = useState("প্রথম আলো");
  const [styleType, setStyleType] = useState<"standard" | "breaking">("standard");
  const [caption, setCaption] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [postedPostId, setPostedPostId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.48);
  const publishPhotocard = useServerFn(publishHeadlinePhotocard);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScale = () => {
      const viewportWidth = window.innerWidth;
      if (viewportWidth < 1024) {
        const previewWidth = Math.min(viewportWidth * 0.92, 440);
        setScale(previewWidth / 1080);
      } else {
        const previewWidth = Math.min(560, viewportWidth - 420 - 64);
        setScale(Math.max(0.3, previewWidth / 1080));
      }
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("একটি JPG, PNG বা অন্য ছবি নির্বাচন করুন।");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhoto(reader.result);
        setPostedPostId(null);
      }
    };
    reader.onerror = () => toast.error("ছবিটি পড়া যায়নি। অন্য ছবি দিয়ে চেষ্টা করুন।");
    reader.readAsDataURL(file);
  }

  const generatedCaption = [
    headline.trim(),
    support.trim(),
    source.trim() ? "তথ্যসূত্র: " + source.trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  async function postToFacebook() {
    const card = captureRef.current;
    const frame = previewFrameRef.current;
    if (!card || !frame) return;
    if (!photo) {
      toast.error("প্রথমে নিউজ ছবি আপলোড করুন।");
      return;
    }

    const finalCaption = (captionEdited ? caption : generatedCaption).trim();
    if (!finalCaption) {
      toast.error("Facebook পোস্টের জন্য একটি ক্যাপশন লিখুন।");
      return;
    }

    setBusy(true);
    const previousCardStyle = card.style.cssText;
    const previousFrameStyle = frame.style.cssText;

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const renderer = await getHtml2Canvas();

      frame.style.width = "1080px";
      frame.style.height = "1080px";
      frame.style.overflow = "visible";
      frame.style.borderRadius = "0";
      frame.style.boxShadow = "none";
      card.style.transform = "none";
      card.style.transformOrigin = "top left";
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = await renderer(card, {
        scale: 1,
        width: 1080,
        height: 1080,
        backgroundColor: "#E9EBEE",
        useCORS: true,
        allowTaint: false,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1080,
        windowHeight: 1080,
        onclone: (clonedDocument: Document) => {
          // html2canvas cannot parse the site's global Tailwind oklch() colors.
          // The card itself uses inline, fixed colors, so remove app styles from
          // the export clone while preserving the Bengali web-font stylesheet.
          clonedDocument.querySelectorAll("style, link[rel='stylesheet']").forEach((element) => {
            if (element instanceof HTMLLinkElement && element.href.includes("fonts.googleapis.com")) return;
            element.remove();
          });
          clonedDocument.documentElement.style.backgroundColor = "#FFFFFF";
          clonedDocument.body.style.backgroundColor = "#FFFFFF";
          clonedDocument.body.style.margin = "0";
          const clonedCard = clonedDocument.getElementById("news-headline-photocard-capture");
          if (clonedCard) {
            clonedCard.style.position = "relative";
            clonedCard.style.left = "0";
            clonedCard.style.top = "0";
            clonedCard.style.width = "1080px";
            clonedCard.style.height = "1080px";
            clonedCard.style.transform = "none";
          }
        },
      });

      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const result = await publishPhotocard({
        data: {
          imageDataUrl,
          caption: finalCaption,
        },
      });
      setPostedPostId(result.postId);
      toast.success("নিউজ হেডলাইন ফটোকার্ড Facebook-এ পোস্ট হয়েছে। Post ID: " + result.postId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Facebook-এ ফটোকার্ড পোস্ট করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      card.style.cssText = previousCardStyle;
      frame.style.cssText = previousFrameStyle;
      setBusy(false);
    }
  }

  const cardStyle: CSSProperties = {
    width: 1080,
    height: 1080,
    background: "#E9EBEE",
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "top left",
    transform: "scale(" + scale + ")",
    overflow: "hidden",
    fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif",
    margin: 0,
    padding: 0,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-black/5 bg-[#F4F5F6] shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col border-r border-black/5 bg-white">
          <div className="border-b border-black/5 px-6 py-5">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="The Connect" className="h-9 w-auto object-contain" />
              <div>
                <p className="text-sm font-bold text-[#111]">নিউজ হেডলাইন ফটোকার্ড</p>
                <p className="mt-0.5 text-xs text-[#777]">স্কয়ার ফরম্যাট · ১০৮০ × ১০৮০ পিক্সেল</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#777]">
              ছবি, হেডলাইন ও তথ্যসূত্র বদলালে ডান পাশের প্রিভিউ সঙ্গে সঙ্গে আপডেট হবে।
            </p>
          </div>

          <div className="flex-1 space-y-5 px-5 py-5">
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-[#222]">নিউজ ছবি</label>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-black/15 bg-[#FAFAFB] p-3 text-left transition-colors hover:border-[#FF5A1A]/40 hover:bg-[#F3F4F6]"
              >
                <div className="flex h-[54px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#E9EBEE]">
                  {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-[#9AA0AA]" />}
                </div>
                <span>
                  <span className="block text-[13px] font-medium text-[#222] group-hover:text-[#FF5A1A]">
                    {photo ? "ছবি পরিবর্তন করুন" : "ছবি আপলোড করুন"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#888]">১৬:৯ অনুপাত · JPG/PNG</span>
                </span>
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </div>

            <div className="space-y-2">
              <label htmlFor="headline-card-title" className="text-[13px] font-semibold text-[#222]">হেডলাইন</label>
              <textarea
                id="headline-card-title"
                value={headline}
                onChange={(event) => { setHeadline(event.target.value); setPostedPostId(null); }}
                rows={2}
                className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-3 text-base font-bold leading-[1.3] text-[#111] focus:border-[#FF5A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                placeholder="হেডলাইন লিখুন"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="headline-card-support" className="text-[13px] font-semibold text-[#222]">সাব-হেডলাইন</label>
              <textarea
                id="headline-card-support"
                value={support}
                onChange={(event) => { setSupport(event.target.value); setPostedPostId(null); }}
                rows={2}
                className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-3 text-sm leading-[1.4] text-[#222] focus:border-[#FF5A1A]/40 focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                placeholder="সাব-হেডলাইন লিখুন"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="headline-card-category" className="text-[13px] font-semibold text-[#222]">ক্যাটেগরি</label>
                <select
                  id="headline-card-category"
                  value={category}
                  onChange={(event) => { setCategory(event.target.value); setPostedPostId(null); }}
                  className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                >
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="headline-card-style" className="text-[13px] font-semibold text-[#222]">টেমপ্লেট স্টাইল</label>
                <select
                  id="headline-card-style"
                  value={styleType}
                  onChange={(event) => { setStyleType(event.target.value as "standard" | "breaking"); setPostedPostId(null); }}
                  className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                >
                  <option value="standard">Standard</option>
                  <option value="breaking">Breaking (লাল)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="headline-card-location" className="text-[13px] font-semibold text-[#222]">লোকেশন</label>
                <input
                  id="headline-card-location"
                  value={location}
                  onChange={(event) => { setLocation(event.target.value); setPostedPostId(null); }}
                  className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-2.5 text-sm text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                  placeholder="ঢাকা"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="headline-card-date" className="text-[13px] font-semibold text-[#222]">তারিখ</label>
                <input
                  id="headline-card-date"
                  value={dateLabel}
                  onChange={(event) => { setDateLabel(event.target.value); setPostedPostId(null); }}
                  className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-2.5 text-sm text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                  placeholder="তারিখ লিখুন"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="headline-card-source" className="text-[13px] font-semibold text-[#222]">তথ্যসূত্র</label>
              <input
                id="headline-card-source"
                value={source}
                onChange={(event) => { setSource(event.target.value); setPostedPostId(null); }}
                className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-2.5 text-sm text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                placeholder="যেমন: প্রথম আলো"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="headline-card-caption" className="text-[13px] font-semibold text-[#222]">Facebook ক্যাপশন</label>
              <textarea
                id="headline-card-caption"
                value={captionEdited ? caption : generatedCaption}
                onChange={(event) => {
                  setCaption(event.target.value);
                  setCaptionEdited(true);
                  setPostedPostId(null);
                }}
                rows={4}
                className="w-full rounded-xl border border-black/10 bg-[#FCFCFD] px-3.5 py-3 text-sm leading-[1.4] text-[#222] focus:outline-none focus:ring-2 focus:ring-[#FF5A1A]/20"
                placeholder="Facebook পোস্টের ক্যাপশন লিখুন"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-[#888]">এখানকার ক্যাপশনসহ ফটোকার্ডটি সরাসরি Facebook Page-এ পোস্ট হবে।</p>
                {captionEdited ? (
                  <button
                    type="button"
                    onClick={() => { setCaptionEdited(false); setCaption(""); setPostedPostId(null); }}
                    className="shrink-0 text-[11px] font-medium text-[#FF5A1A] hover:underline"
                  >
                    হেডলাইন থেকে তৈরি
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-black/5 bg-[#FCFCFD] p-5">
            <button
              type="button"
              onClick={() => void postToFacebook()}
              disabled={!photo || busy || Boolean(postedPostId)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-bold text-white transition-colors hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              {busy ? "Facebook-এ পোস্ট হচ্ছে…" : postedPostId ? "Facebook-এ পোস্ট হয়েছে" : "ফেসবুকে পোস্ট করুন"}
            </button>
            <p className="mt-2.5 text-center text-[11px] leading-4 text-[#777]">
              প্রিভিউ যাচাই করে চাপুন। কার্ডটি The Connect-এর Facebook Page-এ ছবিসহ পোস্ট হবে।
            </p>
            {postedPostId ? (
              <p className="mt-2 break-all text-center text-[11px] leading-4 text-emerald-700">
                সফলভাবে পোস্ট হয়েছে · ID: {postedPostId}
              </p>
            ) : null}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col items-center justify-center overflow-hidden bg-[#EDEEF1] p-4 sm:p-6 lg:p-8">
          <div className="flex w-full max-w-[560px] items-center justify-between px-1 pb-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[#888]">Preview · 1080 × 1080</span>
            <span className="text-[11px] text-[#999]">{Math.round(scale * 1080)}px preview</span>
          </div>

          <div
            ref={previewFrameRef}
            className="relative shrink-0 overflow-hidden rounded-[18px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12),0_2px_10px_rgba(0,0,0,0.06)]"
            style={{ width: 1080 * scale, height: 1080 * scale }}
          >
            <div ref={captureRef} id="news-headline-photocard-capture" style={cardStyle}>
              <div aria-hidden="true" style={{ position: "absolute", width: 720, height: 720, left: -240, top: -260, background: "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.55) 100%)", transform: "rotate(45deg)", opacity: 0.9, pointerEvents: "none" }} />
              <div aria-hidden="true" style={{ position: "absolute", width: 680, height: 680, right: -260, top: -200, background: "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)", transform: "rotate(45deg)", opacity: 0.9, pointerEvents: "none" }} />
              <div aria-hidden="true" style={{ position: "absolute", width: 620, height: 620, left: -180, bottom: -280, background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 100%)", transform: "rotate(45deg)", opacity: 0.8, pointerEvents: "none" }} />
              <div aria-hidden="true" style={{ position: "absolute", left: 40, bottom: 140, width: 220, height: 160, backgroundImage: "radial-gradient(#C8CAD0 1.6px, transparent 1.7px)", backgroundSize: "16px 16px", opacity: 0.45, pointerEvents: "none" }} />
              <div aria-hidden="true" style={{ position: "absolute", right: 60, top: 60, width: 180, height: 140, backgroundImage: "radial-gradient(#C8CAD0 1.6px, transparent 1.7px)", backgroundSize: "16px 16px", opacity: 0.35, pointerEvents: "none" }} />

              <CornerMark corner="top-right" />
              <CornerMark corner="bottom-left" />
              <CornerMark corner="bottom-right" />

              <div style={{ position: "absolute", left: 40, top: 26, zIndex: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, letterSpacing: 0.2, color: "#6B6F76", fontWeight: 500 }}>
                <span>{location || "লোকেশন"}</span>
                <span style={{ opacity: 0.5 }}>|</span>
                <span>{dateLabel || "তারিখ"}</span>
              </div>

              <div style={{ position: "absolute", left: 40, top: 54, zIndex: 10 }}>
                <div style={{ background: styleType === "breaking" ? "#E11D48" : "#FF5A1A", color: "white", fontSize: 13.5, fontWeight: 700, letterSpacing: 0.3, padding: "6px 14px", borderRadius: 6, lineHeight: 1, display: "inline-flex", alignItems: "center", boxShadow: styleType === "breaking" ? "0 0 0 4px rgba(225,29,72,0.15)" : "0 2px 8px rgba(255,90,26,0.25)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "white", display: "inline-block", marginRight: 6 }} />
                  {category}
                </div>
              </div>

              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2 }}>
                <div style={{ height: "auto", width: "100%", display: "flex", justifyContent: "center", alignItems: "center", marginTop: 20, marginBottom: 20, padding: 0, background: "transparent" }}>
                  <img src="/logo.png" alt="The Connect" crossOrigin="anonymous" style={{ height: 154, width: "auto", maxWidth: "70%", objectFit: "contain", display: "block", margin: 0, padding: 0, background: "transparent" }} />
                </div>

                <div style={{ width: "82%", maxWidth: 880 }}>
                  <div style={{ height: 2, background: "#FF5A1A", width: "100%", marginBottom: 10, opacity: 0.95 }} />
                  <div style={{ background: "white", padding: 10, boxShadow: "0 1px 0 rgba(0,0,0,0.04)" }}>
                    <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#D8DCE2", overflow: "hidden", position: "relative" }}>
                      {photo ? (
                        <img src={photo} alt="নিউজ ছবি" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#737985", background: "linear-gradient(135deg, #e9ebee, #d8dce2)", fontSize: 22, fontWeight: 600 }}>
                          <ImagePlus style={{ width: 44, height: 44 }} />
                          নিউজ ছবি আপলোড করুন
                        </div>
                      )}
                      {styleType === "breaking" && (
                        <>
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(220,20,60,0.18) 0%, rgba(0,0,0,0) 60%)", pointerEvents: "none" }} />
                          <div style={{ position: "absolute", right: 18, bottom: 18, width: 64, height: 64, background: "#E11D48", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(225,29,72,0.35)" }}>
                            <span style={{ fontSize: 34, color: "white", fontWeight: 800, lineHeight: 1 }}>↓</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ height: 2, background: "#FF5A1A", width: "100%", marginTop: 10, opacity: 0.95 }} />
                </div>

                <div style={{ width: "84%", maxWidth: 880, marginTop: 30, textAlign: "center" }}>
                  <h1 style={{ margin: 0, fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif", fontSize: 52, fontWeight: 800, lineHeight: 1.18, color: "#111216", letterSpacing: -0.6, overflowWrap: "anywhere" }}>
                    {headline || "হেডলাইন লিখুন"}
                  </h1>
                  {support ? <p style={{ margin: "18px 0 0 0", fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif", fontSize: 27, fontWeight: 500, lineHeight: 1.35, color: "#232428", letterSpacing: -0.2 }}>{support}</p> : null}
                </div>
              </div>

              <div style={{ position: "absolute", left: 52, bottom: 76, zIndex: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                <SocialLink kind="facebook">fb.com/theconnectbd</SocialLink>
                <SocialLink kind="youtube">youtube.com/theconnectbd</SocialLink>
              </div>

              <div style={{ position: "absolute", right: 52, bottom: 76, zIndex: 10, textAlign: "right", maxWidth: 360 }}>
                <div style={{ fontSize: 14.5, color: "#5A5E66", fontStyle: "italic", fontWeight: 500, letterSpacing: 0.1, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {"তথ্যসূত্র: " + (source || "—")}
                </div>
              </div>

              <div aria-hidden="true" style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)", pointerEvents: "none", zIndex: 20 }} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-[#9AA0AA]">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            নিউজ হেডলাইন ফটোকার্ড · নিচের লিংক ও তথ্যসূত্রে L-শেপ গ্রাফিক্স থেকে ১২px গ্যাপ রাখা হয়েছে
          </div>
        </section>
      </div>
    </div>
  );
}
