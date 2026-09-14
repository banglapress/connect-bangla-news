import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listDeskStories } from "@/lib/desk/stories.functions";
import { listDeskJobs, runDeskIngest } from "@/lib/desk/ingest.functions";
import { formatBanglaDateTime } from "@/lib/bangla";

export const Route = createFileRoute("/_authenticated/admin/desk/")({
  component: DeskMonitor,
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

function DeskMonitor() {
  const queryClient = useQueryClient();
  const fetchStories = useServerFn(listDeskStories);
  const fetchJobs = useServerFn(listDeskJobs);
  const ingest = useServerFn(runDeskIngest);
  const [running, setRunning] = useState(false);
  const stories = useQuery({ queryKey: ["desk-stories"], queryFn: () => fetchStories() });
  const jobs = useQuery({ queryKey: ["desk-jobs"], queryFn: () => fetchJobs() });

  async function runNow() {
    setRunning(true);
    try {
      const out = await ingest({ data: {} });
      const failed = out.results.filter((row) => row.error);
      const added = out.results.reduce((sum, row) => sum + row.inserted + row.clustered, 0);
      toast.success(`ইনজেস্ট শেষ · নতুন/ক্লাস্টার ${added}`);
      if (failed.length) toast.error(failed.map((row) => `${row.sourceName}: ${row.error}`).join(" · "));
      await queryClient.invalidateQueries({ queryKey: ["desk-stories"] });
      await queryClient.invalidateQueries({ queryKey: ["desk-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ইনজেস্ট যায়নি");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">সক্রিয় সোর্সের RSS থেকে স্টোরি আসে। একই URL দ্বিতীয়বার ঢোকে না।</p>
        <button type="button" disabled={running} onClick={() => void runNow()} className="bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
          {running ? "চলছে…" : "Run Now"}
        </button>
      </div>

      {stories.isError ? (
        <p className="text-sm text-destructive">{stories.error instanceof Error ? stories.error.message : "স্টোরি পড়া যায়নি"}</p>
      ) : stories.isLoading ? (
        <p className="text-muted-foreground">লোড হচ্ছে…</p>
      ) : (stories.data ?? []).length === 0 ? (
        <p className="border border-border p-6 text-sm text-muted-foreground">এখনো স্টোরি নেই। Run Now চাপুন।</p>
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
                  <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">
                    {src.title || src.url}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-rule mt-8 pb-1 font-serif text-lg font-bold">ইনজেস্ট লগ</h2>
      {(jobs.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">এখনো জব নেই।</p>
      ) : (
        <div className="mt-3 divide-y divide-border border border-border text-xs">
          {(jobs.data ?? []).map((job: any) => (
            <div key={job.id} className="flex flex-wrap gap-3 p-2">
              <span className="uppercase">{job.status}</span>
              <span className="flex-1">{job.payload?.sourceName || job.stage}{job.error ? ` · ${job.error}` : ""}</span>
              <span className="text-muted-foreground">{formatBanglaDateTime(job.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
