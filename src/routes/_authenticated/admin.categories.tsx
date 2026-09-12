import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCategory, listCategories, saveCategory } from "@/lib/category.functions";
import { getMyAccess } from "@/lib/admin.functions";
import type { SiteCategory } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  head: () => ({ meta: [{ title: "ক্যাটেগরি — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: CategoriesAdmin,
});

const emptyForm = { id: "", name: "", slug: "", parent_id: "", show_in_nav: true, nav_order: 0 };

function CategoriesAdmin() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchCats = useServerFn(listCategories);
  const save = useServerFn(saveCategory);
  const remove = useServerFn(deleteCategory);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => fetchCats() });
  const [form, setForm] = useState(emptyForm);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        data: {
          id: form.id || undefined,
          name: form.name,
          slug: form.slug,
          parent_id: form.parent_id || null,
          show_in_nav: form.show_in_nav,
          nav_order: Number(form.nav_order) || 0,
        },
      });
      toast.success("সংরক্ষিত হয়েছে");
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সংরক্ষণ যায়নি");
    }
  }

  if (access.isLoading) return <p className="mx-auto max-w-3xl px-4 py-16">অপেক্ষা করুন…</p>;
  if (!access.data?.roles.includes("admin")) {
    return <p className="mx-auto max-w-3xl px-4 py-16">শুধু অ্যাডমিন ক্যাটেগরি বদলাতে পারেন।</p>;
  }

  const items: SiteCategory[] = cats.data ?? [];
  const parents = items.filter((c) => !c.parent_id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="section-rule mb-6 flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">ক্যাটেগরি</h1>
        <Link to="/admin" className="text-sm text-primary hover:underline">প্যানেলে ফিরুন</Link>
      </div>
      <form onSubmit={onSubmit} className="mb-8 grid gap-3 border border-border p-4 sm:grid-cols-2">
        <input required className="border border-border px-3 py-2" placeholder="নাম" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input required className="border border-border px-3 py-2" placeholder="স্লাগ যেমন rajniti" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <select className="border border-border px-3 py-2" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
          <option value="">মূল ক্যাটেগরি</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="number" className="border border-border px-3 py-2" placeholder="নেভ বার সিরিয়াল" value={form.nav_order} onChange={(e) => setForm({ ...form, nav_order: Number(e.target.value) })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.show_in_nav} onChange={(e) => setForm({ ...form, show_in_nav: e.target.checked })} />
          নেভিগেশন বারে দেখাবে
        </label>
        <button className="bg-primary px-4 py-2 text-sm text-primary-foreground">{form.id ? "আপডেট" : "যোগ করুন"}</button>
      </form>
      <div className="divide-y divide-border border border-border">
        {items.sort((a,b) => (a.nav_order ?? 0) - (b.nav_order ?? 0)).map((c) => (
          <div key={c.id ?? c.slug} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium">{c.parent_id ? "— " : ""}{c.name} <span className="text-xs text-muted-foreground">/{c.slug}</span></p>
              <p className="text-xs text-muted-foreground">সিরিয়াল {c.nav_order ?? 0} · {c.show_in_nav === false ? "নেভে লুকানো" : "নেভে দেখাবে"}</p>
            </div>
            <button type="button" className="text-sm text-primary" onClick={() => setForm({ id: c.id ?? "", name: c.name, slug: c.slug, parent_id: c.parent_id ?? "", show_in_nav: c.show_in_nav !== false, nav_order: c.nav_order ?? 0 })}>সম্পাদনা</button>
            {c.id ? (
              <button type="button" className="text-sm text-destructive" onClick={async () => {
                if (!window.confirm("মুছবেন?")) return;
                try {
                  await remove({ data: { id: c.id! } });
                  await queryClient.invalidateQueries({ queryKey: ["categories"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "মুছা যায়নি");
                }
              }}>মুছুন</button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
