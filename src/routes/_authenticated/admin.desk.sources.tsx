import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { deleteNewsSource, listNewsSources, saveNewsSource, setNewsSourceActive } from "@/lib/desk/sources.functions";

export const Route = createFileRoute("/_authenticated/admin/desk/sources")({
  component: SourceManager,
});

const empty = {
  id: "",
  name: "",
  homepage_url: "",
  rss_url: "",
  api_url: "",
  category_slug: "national",
  active: true,
  trust_level: 3,
  priority: 100,
  notes: "",
};

function SourceManager() {
  const queryClient = useQueryClient();
  const fetchSources = useServerFn(listNewsSources);
  const save = useServerFn(saveNewsSource);
  const toggle = useServerFn(setNewsSourceActive);
  const remove = useServerFn(deleteNewsSource);
  const sources = useQuery({ queryKey: ["news-sources"], queryFn: () => fetchSources() });
  const [form, setForm] = useState(empty);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        data: {
          id: form.id || undefined,
          name: form.name,
          homepage_url: form.homepage_url || null,
          rss_url: form.rss_url || null,
          api_url: form.api_url || null,
          category_slug: form.category_slug || null,
          active: form.active,
          trust_level: Number(form.trust_level),
          priority: Number(form.priority),
          notes: form.notes || null,
        },
      });
      toast.success("সোর্স সংরক্ষিত");
      setForm(empty);
      await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সংরক্ষণ যায়নি");
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="mb-8 grid gap-3 border border-border p-4 sm:grid-cols-2">
        <input required className="border border-border px-3 py-2" placeholder="সোর্সের নাম" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="border border-border px-3 py-2" placeholder="হোমপেজ URL" value={form.homepage_url} onChange={(e) => setForm({ ...form, homepage_url: e.target.value })} />
        <input className="border border-border px-3 py-2 sm:col-span-2" placeholder="RSS URL" value={form.rss_url} onChange={(e) => setForm({ ...form, rss_url: e.target.value })} />
        <input className="border border-border px-3 py-2 sm:col-span-2" placeholder="API URL (থাকলে)" value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} />
        <input className="border border-border px-3 py-2" placeholder="ক্যাটেগরি স্লাগ" value={form.category_slug} onChange={(e) => setForm({ ...form, category_slug: e.target.value })} />
        <input type="number" min={1} max={5} className="border border-border px-3 py-2" placeholder="ট্রাস্ট 1-5" value={form.trust_level} onChange={(e) => setForm({ ...form, trust_level: Number(e.target.value) })} />
        <input type="number" className="border border-border px-3 py-2" placeholder="প্রায়োরিটি" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          সক্রিয়
        </label>
        <textarea className="min-h-16 border border-border px-3 py-2 sm:col-span-2" placeholder="নোট" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="bg-primary px-4 py-2 text-sm text-primary-foreground">{form.id ? "সোর্স আপডেট" : "সোর্স যোগ করুন"}</button>
      </form>

      {sources.isError ? (
        <p className="text-sm text-destructive">{sources.error instanceof Error ? sources.error.message : "সোর্স পড়া যায়নি। SQL মাইগ্রেশন চালিয়েছেন তো?"}</p>
      ) : sources.isLoading ? (
        <p className="text-muted-foreground">সোর্স আনা হচ্ছে…</p>
      ) : (
        <div className="divide-y divide-border border border-border">
          {(sources.data ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.name} {!s.active && <span className="text-xs text-muted-foreground">(বন্ধ)</span>}</p>
                <p className="truncate text-xs text-muted-foreground">
                  ট্রাস্ট {s.trust_level} · প্রায়োরিটি {s.priority} · {s.rss_url || "RSS নেই"}
                </p>
              </div>
              <button type="button" className="text-primary" onClick={() => setForm({
                id: s.id,
                name: s.name,
                homepage_url: s.homepage_url ?? "",
                rss_url: s.rss_url ?? "",
                api_url: s.api_url ?? "",
                category_slug: s.category_slug ?? "",
                active: s.active,
                trust_level: s.trust_level,
                priority: s.priority,
                notes: s.notes ?? "",
              })}>সম্পাদনা</button>
              <button type="button" className="text-primary" onClick={async () => {
                try {
                  await toggle({ data: { id: s.id, active: !s.active } });
                  await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "বদলানো যায়নি");
                }
              }}>{s.active ? "বন্ধ" : "সক্রিয়"}</button>
              <button type="button" className="text-destructive" onClick={async () => {
                if (!window.confirm("সোর্স মুছবেন?")) return;
                try {
                  await remove({ data: { id: s.id } });
                  await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "মুছা যায়নি");
                }
              }}>মুছুন</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
