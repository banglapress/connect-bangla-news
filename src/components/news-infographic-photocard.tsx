import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Facebook, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  generateInfographicContent,
  publishInfographicPhotocard,
} from "@/lib/desk/social.infographic";

type InfographicPoint = { heading: string; detail: string };
type InfographicDraft = {
  kicker: string;
  headline: string;
  summary: string;
  featured_fact: string;
  featured_fact_detail: string;
  points: InfographicPoint[];
  takeaway: string;
  caption: string;
  model: string;
  provider: string;
  generatedAt: string;
};

declare global {
  interface Window {
    html2canvas?: (
      element: HTMLElement,
      options?: Record<string, unknown>,
    ) => Promise<HTMLCanvasElement>;
  }
}

async function getHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("প্রিভিউকে ছবিতে রূপান্তর করার লাইব্রেরি লোড করা যায়নি। আবার চেষ্টা করুন।"));
    document.head.appendChild(script);
  });

  if (!window.html2canvas) {
    throw new Error("ইনফোগ্রাফিক্স রেন্ডারার চালু হয়নি। আবার চেষ্টা করুন।");
  }
  return window.html2canvas;
}

const emptyDraft: InfographicDraft = {
  kicker: "সংক্ষেপে",
  headline: "",
  summary: "",
  featured_fact: "",
  featured_fact_detail: "",
  points: [
    { heading: "প্রথম তথ্য", detail: "" },
    { heading: "দ্বিতীয় তথ্য", detail: "" },
    { heading: "তৃতীয় তথ্য", detail: "" },
  ],
  takeaway: "",
  caption: "",
  model: "",
  provider: "gemini",
  generatedAt: "",
};

export function NewsInfographicPhotocard() {
  const generateContent = useServerFn(generateInfographicContent);
  const publishCard = useServerFn(publishInfographicPhotocard);
  const [newsHeadline, setNewsHeadline] = useState("");
  const [newsText, setNewsText] = useState("");
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<InfographicDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [postedPostId, setPostedPostId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.44);
  const captureRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateScale = () => {
      const previewWidth =
        window.innerWidth < 1024
          ? Math.min(window.innerWidth * 0.9, 440)
          : Math.min(560, window.innerWidth - 420 - 64);
      setScale(Math.max(0.24, previewWidth / 1080));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  function clearApproval() {
    setApproved(false);
    setPostedPostId(null);
  }

  function updateDraft(patch: Partial<InfographicDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    clearApproval();
  }

  function updatePoint(index: number, patch: Partial<InfographicPoint>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        points: current.points.map((point, pointIndex) =>
          pointIndex === index ? { ...point, ...patch } : point,
        ),
      };
    });
    clearApproval();
  }

  async function createInfographic() {
    if (!newsHeadline.trim()) {
      toast.error("নিউজের শিরোনাম লিখুন।");
      return;
    }
    if (newsText.trim().length < 80) {
      toast.error("ইনফোগ্রাফিক্স তৈরির জন্য নিউজের বিস্তারিত অন্তত ৮০ অক্ষর দিন।");
      return;
    }

    setBusy(true);
    setDraft(null);
    clearApproval();
    try {
      const result = await generateContent({
        data: {
          headline: newsHeadline.trim(),
          newsText: newsText.trim(),
          source: source.trim(),
        },
      });
      setDraft({
        kicker: result.kicker,
        headline: result.headline,
        summary: result.summary,
        featured_fact: result.featured_fact,
        featured_fact_detail: result.featured_fact_detail,
        points: result.points,
        takeaway: result.takeaway,
        caption: result.caption,
        model: result.model,
        provider: result.provider,
        generatedAt: result.generatedAt,
      });
      toast.success("AI ইনফোগ্রাফিক্স তৈরি হয়েছে। প্রিভিউ ও তথ্য যাচাই করুন।");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ইনফোগ্রাফিক্স তৈরি করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function approveAndPublish() {
    const card = captureRef.current;
    const frame = previewFrameRef.current;
    if (!draft || !card || !frame) return;
    if (!approved) {
      toast.error("আগে প্রিভিউ যাচাই করে অনুমোদনের ঘরে টিক দিন।");
      return;
    }
    if (postedPostId) {
      toast.error("এই কার্ডটি ইতিমধ্যে পোস্ট হয়েছে।");
      return;
    }
    if (!draft.headline.trim() || draft.points.some((point) => !point.heading.trim() || !point.detail.trim())) {
      toast.error("পোস্ট করার আগে হেডলাইন ও তিনটি মূল তথ্য সম্পূর্ণ করুন।");
      return;
    }

    setBusy(true);
    const previousCardStyle = card.style.cssText;
    const previousFrameStyle = frame.style.cssText;

    try {
      if (document.fonts?.load) {
        await Promise.all([
          document.fonts.load("400 18px 'Hind Siliguri'"),
          document.fonts.load("500 25px 'Hind Siliguri'"),
          document.fonts.load("700 38px 'Hind Siliguri'"),
          document.fonts.load("800 52px 'Hind Siliguri'"),
        ]);
      }
      if (document.fonts?.ready) await document.fonts.ready;
      const renderer = await getHtml2Canvas();
      frame.style.width = "1080px";
      frame.style.height = "1350px";
      frame.style.overflow = "visible";
      frame.style.borderRadius = "0";
      frame.style.boxShadow = "none";
      card.style.transform = "none";
      card.style.transformOrigin = "top left";
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = await renderer(card, {
        scale: 1,
        width: 1080,
        height: 1350,
        backgroundColor: "#F7F7F4",
        useCORS: true,
        allowTaint: false,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1080,
        windowHeight: 1350,
        onclone: (clonedDocument: Document) => {
          // The exported graphic is inline-styled. Removing app CSS avoids the
          // global oklch() colors that html2canvas cannot parse.
          clonedDocument.querySelectorAll("style, link[rel='stylesheet']").forEach((element) => {
            if (
              element.tagName.toLowerCase() === "link" &&
              (element as HTMLLinkElement).href.includes("fonts.googleapis.com")
            ) {
              return;
            }
            element.remove();
          });
          clonedDocument.documentElement.style.backgroundColor = "#FFFFFF";
          clonedDocument.body.style.backgroundColor = "#FFFFFF";
          clonedDocument.body.style.margin = "0";
          const clonedCard = clonedDocument.getElementById("news-infographic-capture");
          if (clonedCard) {
            clonedCard.style.position = "relative";
            clonedCard.style.left = "0";
            clonedCard.style.top = "0";
            clonedCard.style.width = "1080px";
            clonedCard.style.height = "1350px";
            clonedCard.style.transform = "none";
          }
        },
      });

      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const result = await publishCard({
        data: {
          imageDataUrl,
          caption: draft.caption.trim() || draft.headline.trim(),
        },
      });
      setPostedPostId(result.postId);
      toast.success("অনুমোদিত ইনফোগ্রাফিক্স Facebook-এ পোস্ট হয়েছে। Post ID: " + result.postId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Facebook-এ পোস্ট করা যায়নি।");
    } finally {
      card.style.cssText = previousCardStyle;
      frame.style.cssText = previousFrameStyle;
      setBusy(false);
    }
  }

  const displayHeadline = draft?.headline || "নিউজের শিরোনাম এখানে দেখা যাবে";
  const headlineLength = displayHeadline.length;
  const headlineFontSize =
    headlineLength > 72 ? 34 : headlineLength > 55 ? 38 : headlineLength > 38 ? 44 : 52;
  const headlineCharsPerLine =
    headlineFontSize <= 38 ? 43 : headlineFontSize <= 44 ? 35 : 29;
  const headlineLineEstimate = Math.max(
    1,
    Math.min(3, Math.ceil(headlineLength / headlineCharsPerLine)),
  );
  const summaryTop = Math.min(
    438,
    285 + headlineLineEstimate * headlineFontSize * 1.42 + 12,
  );
  const cardStyle: CSSProperties = {
    width: 1080,
    height: 1350,
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    transform: "scale(" + scale + ")",
    transformOrigin: "top left",
    margin: 0,
    padding: 0,
    background: "#F7F7F4",
    color: "#171918",
    fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif",
    boxSizing: "border-box",
  };

  const fieldClass =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20";
  const labelClass = "block text-sm font-medium";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="grid gap-0 lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col border-r border-border bg-background">
          <div className="border-b border-border px-5 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold">AI নিউজ ইনফোগ্রাফিক্স</p>
                <p className="mt-0.5 text-xs text-muted-foreground">মিনিমাল · ১০৮০ × ১৩৫০</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              নিউজের লেখা থেকে AI মূল তথ্য সাজাবে। যাচাই ও অনুমোদন না করা পর্যন্ত কিছুই Facebook-এ পোস্ট হবে না।
            </p>
          </div>

          <div className="flex-1 space-y-4 p-5">
            <label className={labelClass}>
              নিউজের শিরোনাম
              <input
                value={newsHeadline}
                onChange={(event) => {
                  setNewsHeadline(event.target.value);
                  setDraft(null);
                  clearApproval();
                }}
                maxLength={300}
                placeholder="নিউজের হেডলাইন দিন"
                className={fieldClass}
              />
            </label>

            <label className={labelClass}>
              নিউজের বিস্তারিত
              <textarea
                value={newsText}
                onChange={(event) => {
                  setNewsText(event.target.value);
                  setDraft(null);
                  clearApproval();
                }}
                rows={8}
                maxLength={18000}
                placeholder="নিউজের পুরো লেখা বা প্রয়োজনীয় অংশ এখানে পেস্ট করুন। AI শুধু এই লেখায় থাকা তথ্য থেকেই ইনফোগ্রাফিক্স সাজাবে।"
                className={fieldClass + " leading-6"}
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {newsText.length} / ১৮,০০০ অক্ষর · কমপক্ষে ৮০ অক্ষর
              </span>
            </label>

            <label className={labelClass}>
              তথ্যসূত্র / সংবাদমাধ্যম
              <input
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  clearApproval();
                }}
                maxLength={300}
                placeholder="যেমন: প্রথম আলো, বাংলাদেশ ব্যাংক"
                className={fieldClass}
              />
            </label>

            <button
              type="button"
              onClick={() => void createInfographic()}
              disabled={busy || !newsHeadline.trim() || newsText.trim().length < 80}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "AI ইনফোগ্রাফিক্স তৈরি করছে…" : draft ? "নতুন করে AI দিয়ে তৈরি করুন" : "AI দিয়ে ইনফোগ্রাফিক্স তৈরি করুন"}
            </button>

            {draft ? (
              <div className="space-y-4 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-semibold">AI-এর তৈরি কনটেন্ট সম্পাদনা</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    যেকোনো তথ্য ঠিক করতে পারবেন। পরিবর্তন করলে আগের অনুমোদন বাতিল হবে।
                  </p>
                </div>

                <label className={labelClass}>
                  বিষয়-লেবেল
                  <input value={draft.kicker} onChange={(event) => updateDraft({ kicker: event.target.value })} maxLength={90} className={fieldClass} />
                </label>
                <label className={labelClass}>
                  ইনফোগ্রাফিক্স হেডলাইন
                  <textarea value={draft.headline} onChange={(event) => updateDraft({ headline: event.target.value })} rows={3} maxLength={90} className={fieldClass} />
                </label>
                <label className={labelClass}>
                  সংক্ষিপ্ত পরিচিতি
                  <textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} rows={3} maxLength={320} className={fieldClass} />
                </label>

                <div className="space-y-3">
                  <label className={labelClass}>
                    গুরুত্বপূর্ণ তথ্য / হাইলাইট (ঐচ্ছিক)
                    <textarea value={draft.featured_fact} onChange={(event) => updateDraft({ featured_fact: event.target.value })} rows={3} maxLength={100} placeholder="সংখ্যা না হলেও চলবে—নিউজের সবচেয়ে তাৎপর্যপূর্ণ তথ্য" className={fieldClass} />
                  </label>
                  <label className={labelClass}>
                    সহায়ক ব্যাখ্যা (ঐচ্ছিক)
                    <textarea value={draft.featured_fact_detail} onChange={(event) => updateDraft({ featured_fact_detail: event.target.value })} rows={2} maxLength={140} placeholder="প্রয়োজনে এক লাইনের ব্যাখ্যা বা প্রেক্ষাপট" className={fieldClass} />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold">৩টি মূল তথ্য</p>
                  {draft.points.map((point, index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-xs font-semibold text-primary">তথ্য {String(index + 1).padStart(2, "0")}</p>
                      <input value={point.heading} onChange={(event) => updatePoint(index, { heading: event.target.value })} maxLength={80} className={fieldClass} aria-label={"তথ্য " + (index + 1) + " শিরোনাম"} />
                      <textarea value={point.detail} onChange={(event) => updatePoint(index, { detail: event.target.value })} rows={2} maxLength={220} className={fieldClass} aria-label={"তথ্য " + (index + 1) + " বিবরণ"} />
                    </div>
                  ))}
                </div>

                <label className={labelClass}>
                  শেষ কথা / মূল বার্তা
                  <textarea value={draft.takeaway} onChange={(event) => updateDraft({ takeaway: event.target.value })} rows={3} maxLength={260} className={fieldClass} />
                </label>
                <label className={labelClass}>
                  Facebook ক্যাপশন
                  <textarea value={draft.caption} onChange={(event) => updateDraft({ caption: event.target.value })} rows={4} maxLength={3000} className={fieldClass} />
                </label>
                <p className="text-xs text-muted-foreground">AI মডেল: {draft.model}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col items-center justify-start overflow-hidden bg-[#EDEEF1] p-4 sm:p-6 lg:p-8">
          <div className="flex w-full max-w-[560px] items-center justify-between px-1 pb-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview · 1080 × 1350</span>
            <span className="text-[11px] text-muted-foreground">{Math.round(scale * 1080)}px wide</span>
          </div>

          <div
            ref={previewFrameRef}
            className="relative shrink-0 overflow-hidden rounded-[16px] bg-white shadow-[0_16px_50px_rgba(0,0,0,0.12)]"
            style={{ width: 1080 * scale, height: 1350 * scale }}
          >
            <div ref={captureRef} id="news-infographic-capture" style={cardStyle}>
              <div style={{ position: "absolute", inset: "0 0 auto 0", height: 12, background: "#FF5A1A" }} />
              <div style={{ position: "absolute", inset: "12px 0 0 0", background: "linear-gradient(145deg, #F7F7F4 0%, #FFFFFF 60%, #F4F1EB 100%)" }} />
              <div style={{ position: "absolute", right: -90, top: 140, width: 300, height: 300, border: "2px solid #E5E3DC", borderRadius: "50%", opacity: 0.6 }} />
              <div style={{ position: "absolute", right: -35, top: 195, width: 190, height: 190, border: "2px solid #EDE9E0", borderRadius: "50%", opacity: 0.8 }} />
              <div style={{ position: "absolute", left: 60, top: 132, right: 60, height: 86, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
                <img src="/logo.png" alt="The Connect" crossOrigin="anonymous" style={{ width: 190, maxHeight: 78, objectFit: "contain", objectPosition: "left center", display: "block" }} />
                <div style={{ border: "1px solid #D9D8D1", borderRadius: 99, padding: "12px 18px", background: "rgba(255,255,255,0.84)", color: "#555A56", fontSize: 17, fontWeight: 700, letterSpacing: 1.2 }}>
                  NEWS INFOGRAPHIC
                </div>
              </div>

              <div style={{ position: "absolute", left: 68, top: 246, zIndex: 2, color: "#E95319", fontSize: 23, lineHeight: 1.4, fontWeight: 700, letterSpacing: 0.4 }}>
                {draft?.kicker || "সংক্ষেপে"}
              </div>

              <h1 style={{ position: "absolute", left: 64, right: 64, top: 285, margin: 0, zIndex: 2, color: "#171918", fontSize: headlineFontSize, fontWeight: 800, lineHeight: 1.42, letterSpacing: 0, maxHeight: headlineFontSize * 1.42 * 3, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                {draft?.headline || "নিউজের শিরোনাম এখানে দেখা যাবে"}
              </h1>

              <p style={{ position: "absolute", left: 68, right: 68, top: summaryTop, margin: 0, zIndex: 2, color: "#626762", fontSize: 25, fontWeight: 500, lineHeight: 1.48, maxHeight: 80, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                {draft?.summary || "নিউজের বিস্তারিত দিন, AI মূল তথ্য ও সংক্ষিপ্ত ব্যাখ্যা সাজিয়ে দেবে।"}
              </p>

              <div style={{ position: "absolute", left: 64, right: 64, top: 532, height: 206, zIndex: 2, overflow: "hidden", borderRadius: 24, background: draft?.featured_fact ? "#191D1A" : "#F0EDE5", color: draft?.featured_fact ? "#FFFFFF" : "#20231F", boxSizing: "border-box", padding: "25px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {draft?.featured_fact ? (
                  <>
                    <div style={{ color: "#FFFFFF", fontSize: draft.featured_fact_detail ? (draft.featured_fact.length > 70 ? 25 : draft.featured_fact.length > 48 ? 27 : draft.featured_fact.length > 30 ? 29 : 34) : (draft.featured_fact.length > 76 ? 28 : draft.featured_fact.length > 48 ? 31 : draft.featured_fact.length > 30 ? 35 : 42), fontWeight: 800, lineHeight: 1.5, maxHeight: draft.featured_fact_detail ? 92 : 154, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                      {draft.featured_fact}
                    </div>
                    {draft.featured_fact_detail ? (
                      <div style={{ marginTop: 5, color: "#D4D8D2", fontSize: 18, lineHeight: 1.5, maxHeight: 56, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                        {draft.featured_fact_detail}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ color: "#555A56", fontSize: 27, lineHeight: 1.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                    গুরুত্বপূর্ণ তথ্য এখানে তুলে ধরা হবে।
                  </div>
                )}
              </div>

              <div style={{ position: "absolute", left: 66, right: 66, top: 760, zIndex: 2 }}>
                {(draft?.points || emptyDraft.points).map((point, index) => (
                  <div key={index} style={{ display: "flex", gap: 18, alignItems: "flex-start", minHeight: 116, padding: "5px 0 5px", borderBottom: index < 2 ? "1px solid #E7E5DE" : "none", boxSizing: "border-box" }}>
                    <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", background: index === 0 ? "#FF5A1A" : "#E9E7DF", color: index === 0 ? "#FFFFFF" : "#3C403B", fontSize: 17, fontWeight: 800 }}>
                      {["১", "২", "৩"][index]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 20, lineHeight: 1.5, fontWeight: 800, color: "#222620", maxHeight: 42, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{point.heading}</div>
                      <div style={{ marginTop: 3, fontSize: 17, lineHeight: 1.5, color: "#686D66", maxHeight: 61, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{point.detail || "AI তৈরি করার পর এই তথ্য দেখা যাবে।"}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ position: "absolute", left: 64, right: 64, top: 1120, height: 126, zIndex: 2, borderLeft: "8px solid #FF5A1A", borderRadius: "0 17px 17px 0", background: "#F0EDE5", padding: "17px 23px", boxSizing: "border-box", display: "flex", alignItems: "center" }}>
                <div style={{ margin: 0, color: "#30342F", fontSize: 22, lineHeight: 1.5, fontWeight: 700, maxHeight: 74, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                  {draft?.takeaway || "সংবাদটি থেকে সবচেয়ে গুরুত্বপূর্ণ বার্তা এখানে আসবে।"}
                </div>
              </div>

              <div style={{ position: "absolute", left: 64, right: 64, top: 1272, height: 2, background: "#DCDAD2", zIndex: 2 }} />

              {source.trim() ? (
                <div style={{ position: "absolute", left: 66, top: 1290, zIndex: 2, width: 500, color: "#777B73", fontSize: 15, lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {"তথ্যসূত্র: " + source.trim()}
                </div>
              ) : null}

              <div style={{ position: "absolute", right: 66, top: 1282, zIndex: 2, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#626761", fontSize: 15, fontWeight: 600 }}>
                  <div style={{ width: 31, height: 31, borderRadius: 8, background: "#1877F2", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", fontSize: 26, fontWeight: 800 }}>f</div>
                  <span>theconnectbd</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#626761", fontSize: 15, fontWeight: 600 }}>
                  <div style={{ width: 34, height: 25, borderRadius: 7, background: "#FF0033", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>▶</div>
                  <span>theconnectbd</span>
                </div>
              </div>

              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, background: "#FF5A1A", zIndex: 3 }} />
            </div>
          </div>

          <div className="mt-4 flex w-full max-w-[560px] flex-col gap-3">
            {draft ? (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-border bg-white/70 p-3 text-xs leading-5 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  AI কনটেন্ট প্রস্তুত। সব তথ্য মূল নিউজের সঙ্গে মিলিয়ে দেখে নিন। পরিবর্তন করলে আবার অনুমোদন দিতে হবে।
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm leading-5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={approved}
                    onChange={(event) => {
                      setApproved(event.target.checked);
                      setPostedPostId(null);
                    }}
                    disabled={busy || Boolean(postedPostId)}
                  />
                  <span>আমি ইনফোগ্রাফিক্সের লেখা ও প্রিভিউ যাচাই করেছি। Facebook-এ পোস্ট করার অনুমোদন দিচ্ছি।</span>
                </label>
                <button
                  type="button"
                  onClick={() => void approveAndPublish()}
                  disabled={busy || !approved || Boolean(postedPostId)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-4 text-sm font-bold text-white hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
                  {busy ? "Facebook-এ পোস্ট হচ্ছে…" : postedPostId ? "Facebook-এ পোস্ট হয়েছে" : "অনুমোদন করে Facebook-এ পোস্ট করুন"}
                </button>
                {postedPostId ? (
                  <p className="break-all text-center text-xs text-emerald-700">পোস্ট সফল · ID: {postedPostId}</p>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-5 text-muted-foreground">
                নিউজের শিরোনাম ও বিস্তারিত দিন। AI কনটেন্ট তৈরি করলে এখানে প্রিভিউ, অনুমোদন এবং Facebook পোস্টের অপশন আসবে।
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
