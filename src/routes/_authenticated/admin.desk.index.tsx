import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDeskStories } from "@/lib/desk/stories.functions";

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
  const fetchStories = useServerFn(listDeskStories);
  const stories = useQuery({ queryKey: ["desk-stories"], queryFn: () => fetchStories() });

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        ধাপ ২-এ RSS ধরে স্টোরি আসবে। এখন শুধু মনিটরের ঢাচা প্রস্তুত। সোর্স যোগ বা বন্ধ রাখতে «সোর্স ম্যানেজার» ব্যবহার করুন।
      </p>
      {stories.isError ? (
        <p className="text-sm text-destructive">{stories.error instanceof Error ? stories.error.message : "স্টোরি তালিকা পড়া যায়নি"}</p>
      ) : stories.isLoading ? (
        <p className="text-muted-foreground">লোড হচ্ছে…</p>
      ) : (stories.data ?? []).length === 0 ? (
        <p className="border border-border p-6 text-sm text-muted-foreground">এখনো কোনো স্টোরি নেই।</p>
      ) : (
        <div className="divide-y divide-border border border-border">
          {(stories.data ?? []).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="border border-border px-2 py-0.5 text-xs">{LABELS[row.status] ?? row.status}</span>
              <span className="flex-1 font-medium">{row.title_hint || "শিরোনামহীন"}</span>
              <span className="text-xs text-muted-foreground">{row.source_count} সোর্স</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
