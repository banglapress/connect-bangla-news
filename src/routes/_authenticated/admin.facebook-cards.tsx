import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChartNoAxesCombined,
  Image,
  LayoutTemplate,
} from "lucide-react";
import { NewsHeadlinePhotocard } from "@/components/news-headline-photocard";
import { NewsInfographicPhotocard } from "@/components/news-infographic-photocard";

export const Route = createFileRoute("/_authenticated/admin/facebook-cards")({
  head: () => ({
    meta: [
      { title: "Facebook Photo Cards — The Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FacebookCardsPage,
});

function FacebookCardsPage() {
  const [activeTool, setActiveTool] = useState<"headline" | "infographic" | "library">("library");

  return (
    <div className="min-h-[70vh] bg-muted/20">
      <div className="mx-auto max-w-[1440px] px-4 py-8">
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Image className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">The Connect</p>
                  <h1 className="font-serif text-2xl font-bold">Facebook Photo Cards</h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                নিউজ হেডলাইন ও এআই ইনফোগ্রাফিক্সের জন্য আলাদা মডিউল। প্রতিটি কার্ড দেখে অনুমোদন দেওয়ার পরেই Facebook-এ পোস্ট হবে।
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/desk" className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-secondary">
                AI Newsroom
              </Link>
              <Link to="/admin" className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-secondary">
                সম্পাদকীয় প্যানেল
              </Link>
            </div>
          </div>

          {activeTool === "headline" ? (
            <div className="mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Photocard module 01</p>
                  <h2 className="mt-1 font-serif text-xl font-bold">নিউজ হেডলাইন ফটোকার্ড</h2>
                  <p className="mt-1 text-sm text-muted-foreground">ছবি ও তথ্য ঠিক করে প্রিভিউ দেখে সরাসরি Facebook-এ পোস্ট করুন।</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool("library")}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  সব ফটোকার্ড
                </button>
              </div>
              <NewsHeadlinePhotocard />
            </div>
          ) : activeTool === "infographic" ? (
            <div className="mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Photocard module 02</p>
                  <h2 className="mt-1 font-serif text-xl font-bold">ফেসবুক ইনফোগ্রাফিক্স ফটোকার্ড</h2>
                  <p className="mt-1 text-sm text-muted-foreground">AI কনটেন্ট সাজাবে। আপনি যাচাই ও অনুমোদন দিলে সরাসরি Facebook-এ পোস্ট হবে।</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTool("library")}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  সব ফটোকার্ড
                </button>
              </div>
              <NewsInfographicPhotocard />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <section className="flex flex-col rounded-xl border border-primary/30 bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Image className="h-4 w-4" />
                    </span>
                    নিউজ হেডলাইন ফটোকার্ড
                  </div>
                  <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-[#E9EBEE] p-4">
                  <div className="w-full max-w-[230px] rounded-md bg-white p-2 shadow-sm">
                    <div className="relative flex aspect-square flex-col items-center overflow-hidden bg-[#E9EBEE] px-3 pt-2 text-center">
                      <span className="text-[8px] font-bold tracking-[0.2em] text-[#333]">THE CONNECT</span>
                      <span className="mt-2 h-1 w-full bg-[#FF5A1A]" />
                      <span className="mt-2 aspect-video w-full bg-[#D8DCE2]" />
                      <span className="mt-2 text-[11px] font-bold leading-4 text-[#111]">নিউজ হেডলাইন</span>
                      <span className="mt-1 w-2/3 border-t border-[#FF5A1A]" />
                    </div>
                  </div>
                </div>

                <p className="mt-3 flex-1 text-xs leading-5 text-muted-foreground">
                  ছবি, হেডলাইন, সাব-হেডলাইন, ক্যাটেগরি, লোকেশন, তারিখ ও তথ্যসূত্রসহ ১০৮০ × ১০৮০ পিক্সেলের কার্ড।
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTool("headline")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  ফটোকার্ড তৈরি করুন
                  <ArrowRight className="h-4 w-4" />
                </button>
              </section>

              <section className="flex flex-col rounded-xl border border-primary/30 bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ChartNoAxesCombined className="h-4 w-4" />
                    </span>
                    AI নিউজ ইনফোগ্রাফিক্স
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">AI চালু</span>
                </div>

                <div className="mt-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-[#F7F7F4] p-4">
                  <div className="w-full max-w-[230px] space-y-2 rounded-md border border-[#E1DFD6] bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="h-3 w-14 rounded-sm bg-[#20231F]" />
                      <span className="h-3 w-9 rounded-sm bg-[#FF5A1A]" />
                    </div>
                    <div className="h-8 w-full rounded-sm bg-[#F0EDE5]" />
                    <div className="h-20 w-full rounded-sm bg-[#191D1A]" />
                    <div className="space-y-2">
                      <div className="h-5 w-full rounded-sm bg-[#F0EDE5]" />
                      <div className="h-5 w-11/12 rounded-sm bg-[#F0EDE5]" />
                      <div className="h-5 w-10/12 rounded-sm bg-[#F0EDE5]" />
                    </div>
                    <div className="h-8 w-full rounded-sm border-l-4 border-[#FF5A1A] bg-[#F0EDE5]" />
                  </div>
                </div>

                <p className="mt-3 flex-1 text-xs leading-5 text-muted-foreground">
                  নিউজ থেকে মূল তথ্য ও সংখ্যা সাজিয়ে ১০৮০ × ১৩৫০ পিক্সেলের ইনফোগ্রাফিক্স। আপনার অনুমোদন ছাড়া পোস্ট হবে না।
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTool("infographic")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  AI ইনফোগ্রাফিক্স তৈরি করুন
                  <ArrowRight className="h-4 w-4" />
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
