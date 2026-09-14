import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyAccess } from "@/lib/admin.functions";
import { listDeskStories } from "@/lib/desk/stories.functions";
import { listDeskJobs, runDeskIngest } from "@/lib/desk/ingest.functions";
import { formatBanglaDateTime } from "@/lib/bangla";

export const Route = createFileRoute("/_authenticated/admin/desk")({
  head: () => ({ meta: [{ title: "এআই ডেস্ক — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: DeskPage,
});

const LABELS: Record<string, string> = {
  new: "NEW",
  researching: "RESEARCHING",
  draft: "DRAFT",
  review: "REVIEW",
  approved: "APPROVED",
  published: "PUBLISHED",
  rejected: "REJECTED",
};

function DeskPage() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchStories = useServerFn(listDeskStories);
  const fetchJobs = useServerFn(listDeskJobs);
  const ingest = useServerFn(runDeskIngest);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const stories = useQuery({ queryKey: ["desk-stories"], queryFn: () => fetchStories(), enabled: access.data?.isStaff === true });
  const jobs = useQuery({ queryKey: ["desk-jobs"], queryFn: () => fetchJobs(), enabled: access.data?.isStaff === true });

  async function runNow() {
    setRunning(true);
    setSummary(null);
    try {
      const out = await ingest({ data: {} });
      const fetched = out.results.reduce((n, r) => n + r.fetched, 0);
      const inserted = out.results.reduce((n, r) => n + r.inserted, 0);
      const clustered = out.results.reduce((n, r) => n + r.clustered, 0);
      const duplicates = out.results.reduce((n, r) => n + r.duplicates, 0);
      const skippedOld = out.results.reduce((n, r) => n + r.skippedOld, 0);
      const errors = out.results.filter((r) => r.error);
      const text = `Fetched ${fetched} · New ${inserted} · Duplicate ${duplicates} · Skipped (too old) ${skippedOld} · Clustered ${clustered} · Error ${errors.length}`;
      setSummary(text);
      toast.success(text);
      for (const row of errors) toast.error(`${row.sourceName}: ${row.error}`);
      await queryClient.invalidateQueries({ queryKey: ["desk-stories"] });
      await queryClient.invalidateQueries({ queryKey: ["desk-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ইনজেস্ট যায়নি";
      setSummary(message);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  if (access.isLoading) return <p className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">অপেক্ষা করুন…</p>;
  if (!access.data?.isStaff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">এআই ডেস্ক শুধু সম্পাদকীয় দলের জন্য</h1>
        <Link to="/admin" className="mt-6 inline-block text-primary hover:underline">প্যানেলে ফিরুন</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule mb-6 flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">স্টোরি মনিটর</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" disabled={running} onClick={() => void runNow()} className="bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-60">
            {running ? "RSS আনা হচ্ছে…" : "Run Now"}
          </button>
          <a href="/admin/desk/sources" className="border border-border px-3 py-2 hover:bg-secondary">সোর্স</a>
          <a href="/admin/desk/settings" className="border border-border px-3 py-2 hover:bg-secondary">সেটিংস</a>
          <Link to="/admin" className="px-3 py-2 text-primary hover:underline">মুখ্য প্যানেল</Link>
        </div>
      </div>

      {summary ? <p className="mb-4 border border-border p-3 text-sm">{summary}</p> : (
        <p className="mb-4 text-sm text-muted-foreground">প্রথম Run লুকব্যাক ওয়িন্ডো নেয়। পরের Run-এ শুধু নতুন URL/তারিখ নেয়।</p>
      )}

      {stories.isError ? (
        <p className="text-sm text-destructive">{stories.error instanceof Error ? stories.error.message : "স্টোরি পড়া যায়নি"}</p>
      ) : stories.isLoading ? (
        <p className="text-muted-foreground">লোড হচ্ছে…</p>
      ) : (
        <div className="divide-y divide-border border border-border">
          {(stories.data ?? []).map((row) => (
            <div key={row.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="border border-border px-2 py-0.5 text-xs">{LABELS[row.status] ?? row.status}</span>
                <span className="flex-1 font-medium">{row.title_hint || "শিরোনামহীন"}</span>
                <span className="text-xs text-muted-foreground">{row.source_count} সোর্স</span>
              </div>
              {row.warning ? <p className="mt-1 text-xs text-destructive">{row.warning}</p> : null}
              <div className="mt-2 space-y-1 text-xs">
                {(row.sources ?? []).map((src) => (
                  <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">{src.title || src.url}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-rule mt-8 pb-1 font-serif text-lg font-bold">ইনজেস্ট লগ</h2>
      <div className="mt-3 divide-y divide-border border border-border text-xs">
        {(jobs.data ?? []).map((job: any) => (
          <div key={job.id} className="flex flex-wrap gap-3 p-2">
            <span className="uppercase">{job.status}</span>
            <span className="flex-1">{job.payload?.sourceName || job.stage}{job.error ? ` · ${job.error}` : ""}</span>
            <span className="text-muted-foreground">{formatBanglaDateTime(job.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
