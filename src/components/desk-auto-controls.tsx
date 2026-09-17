import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { runDeskIngest } from "@/lib/desk/ingest.functions";
import { runDeskAutoDraft } from "@/lib/desk/auto-draft.functions";

export function DeskAutoControls() {
  const queryClient = useQueryClient();
  const ingest = useServerFn(runDeskIngest);
  const autoDraft = useServerFn(runDeskAutoDraft);
  const [running, setRunning] = useState<"rss" | "draft" | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["desk-stories"] });
    await queryClient.invalidateQueries({ queryKey: ["desk-jobs"] });
    await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
  }

  async function runRss() {
    setRunning("rss");
    setSummary(null);
    try {
      const out = await ingest({ data: {} });
      const fetched = out.results.reduce((n, r) => n + r.fetched, 0);
      const inserted = out.results.reduce((n, r) => n + r.inserted, 0);
      const text = `অটো আরএসএস শেষ · fetched ${fetched} · নতুন স্টোরি ${inserted}`;
      setSummary(text);
      toast.success(text);
      for (const row of out.results.filter((r) => r.error)) toast.error(`${row.sourceName}: ${row.error}`);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "আরএসএস আনা যায়নি";
      setSummary(message);
      toast.error(message);
    } finally {
      setRunning(null);
    }
  }

  async function runDraft() {
    setRunning("draft");
    setSummary(null);
    try {
      const out = await autoDraft({ data: undefined });
      const drafts = out.processed.filter((row) => row.step === "draft").length;
      const needs = out.processed.filter((row) => row.step === "needs_sources").length;
      const errors = out.processed.filter((row) => row.step === "error").length;
      const text = `অটো ড্রাফট শেষ · ড্রাফট ${drafts} · সোর্স প্রয়োজন ${needs} · ত্রুটি ${errors}`;
      setSummary(text);
      toast.success(text);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "অটো ড্রাফট যায়নি";
      setSummary(message);
      toast.error(message);
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="mb-6 border-2 border-primary p-4">
      <h2 className="font-serif text-lg font-bold">অটো নিউজরুম</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        আরএসএস শুধু স্টোরি বানায়। অটো ড্রাফট আরএসএস পর রিলেটেড সর্চ, রিসার্চ ও আর্টিকেল লিখে শুধু ড্রাফটে রাখে। পাবলিশ হয় না।
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={!!running} onClick={() => void runRss()} className="bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {running === "rss" ? "আরএসএস আনা হচ্ছে…" : "অটো আরএসএস চালান"}
        </button>
        <button type="button" disabled={!!running} onClick={() => void runDraft()} className="border border-border px-5 py-3 text-sm font-medium disabled:opacity-60">
          {running === "draft" ? "ড্রাফট বানানো হচ্ছে…" : "অটো ড্রাফট চালান"}
        </button>
      </div>
      {summary ? <p className="mt-3 border border-border p-3 text-sm">{summary}</p> : null}
    </section>
  );
}
