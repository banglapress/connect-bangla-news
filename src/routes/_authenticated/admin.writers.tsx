import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { deleteWriter, listWriters, saveWriter } from "@/lib/writer.functions";
import { getMyAccess } from "@/lib/admin.functions";
import { slugifyName } from "@/lib/bangla";
import { uploadNewsImage } from "@/lib/upload-image";

export const Route = createFileRoute("/_authenticated/admin/writers")({
  head: () => ({ meta: [{ title: "লেখক — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: WritersAdmin,
});

const empty = { id: "", name: "", slug: "", bio: "", photo_url: "", email: "", managed_by_desk: true };

function WritersAdmin() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchWriters = useServerFn(listWriters);
  const save = useServerFn(saveWriter);
  const remove = useServerFn(deleteWriter);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const writers = useQuery({ queryKey: ["writers"], queryFn: () => fetchWriters() });
  const [form, setForm] = useState(empty);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save({
        data: {
          id: form.id || undefined,
          name: form.name,
          slug: form.slug || slugifyName(form.name),
          bio: form.bio || null,
          photo_url: form.photo_url || null,
          email: form.email || null,
          managed_by_desk: form.managed_by_desk,
        },
      });
      toast.success("লেখক সংরক্ষিত হয়েছে");
      setForm(empty);
      await queryClient.invalidateQueries({ queryKey: ["writers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সংরক্ষণ যায়নি");
    }
  }

  if (!access.data?.isStaff) return <p className="mx-auto max-w-3xl px-4 py-16">শুধু সম্পাদকীয় দলের জন্য।</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="section-rule mb-6 flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">লেখক</h1>
        <Link to="/admin" className="text-sm text-primary hover:underline">প্যানেলে ফিরুন</Link>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        বয়স্ক কলামিস্টদের লগইন লাগবে না। ডেস্ক তাদের নাম, বায়ো ও ছবি যোগ করুন। নতুন খবরে সেই তালিকা থেকে লেখক বাছান।
      </p>
      <form onSubmit={onSubmit} className="mb-8 grid gap-3 border border-border p-4 sm:grid-cols-2">
        <input required className="border border-border px-3 py-2" placeholder="লেখকের নাম" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.id ? form.slug : slugifyName(e.target.value) })} />
        <input className="border border-border px-3 py-2" placeholder="স্লাগ" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <input className="border border-border px-3 py-2 sm:col-span-2" placeholder="ইমেইল (থাকলে)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <textarea className="min-h-24 border border-border px-3 py-2 sm:col-span-2" placeholder="সংক্ষিপ্ত বায়ো" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        <input className="border border-border px-3 py-2 sm:col-span-2" placeholder="ছবির লিংক" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
        <input type="file" accept="image/*" className="text-sm sm:col-span-2" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const url = await uploadNewsImage(file);
            setForm((v) => ({ ...v, photo_url: url }));
            toast.success("ছবি যুক্ত হয়েছে");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "ছবি আপলোড যায়নি");
          }
        }} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.managed_by_desk} onChange={(e) => setForm({ ...form, managed_by_desk: e.target.checked })} />
          ডেস্ক প্রকাশ করে (লগইন ছাড়া না)
        </label>
        <button className="bg-primary px-4 py-2 text-sm text-primary-foreground">{form.id ? "আপডেট" : "লেখক যোগ করুন"}</button>
      </form>
      <div className="divide-y divide-border border border-border">
        {(writers.data ?? []).map((w) => (
          <div key={w.id ?? w.slug} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium">{w.name} <span className="text-xs text-muted-foreground">/writer/{w.slug}</span></p>
              <p className="text-xs text-muted-foreground">{w.managed_by_desk ? "ডেস্ক-ম্যানেজড" : "নিজে লিখেন"}{w.bio ? ` · ${w.bio.slice(0, 70)}` : ""}</p>
            </div>
            <button type="button" className="text-sm text-primary" onClick={() => setForm({
              id: w.id ?? "",
              name: w.name,
              slug: w.slug,
              bio: w.bio ?? "",
              photo_url: w.photo_url ?? "",
              email: w.email ?? "",
              managed_by_desk: w.managed_by_desk !== false,
            })}>সম্পাদনা</button>
            {w.id ? (
              <button type="button" className="text-sm text-destructive" onClick={async () => {
                if (!window.confirm("মুছবেন?")) return;
                try {
                  await remove({ data: { id: w.id! } });
                  await queryClient.invalidateQueries({ queryKey: ["writers"] });
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
