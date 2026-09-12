import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createArticle, updateArticle } from "@/lib/admin.functions";
import { CATEGORIES } from "@/lib/categories";
import { slugifyBangla } from "@/lib/bangla";
import { uploadNewsImage } from "@/lib/upload-image";

export type EditorValues = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category_slug: string;
  tags: string;
  image_url: string | null;
  image_caption: string | null;
  author_name: string;
  is_lead: boolean;
  is_featured: boolean;
  status: "draft" | "published";
};

export const emptyArticle: EditorValues = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  category_slug: "national",
  tags: "",
  image_url: null,
  image_caption: "",
  author_name: "নিজস্ব প্রতিবেদক",
  is_lead: false,
  is_featured: false,
  status: "draft",
};

const inputClass =
  "w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary";

export function ArticleEditor({ initial }: { initial: EditorValues }) {
  const [values, setValues] = useState<EditorValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const create = useServerFn(createArticle);
  const update = useServerFn(updateArticle);

  function set<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadNewsImage(file);
      set("image_url", url);
      toast.success("ছবি যুক্ত হয়েছে");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ছবি আপলোড করা যায়নি");
    } finally {
      setUploading(false);
    }
  }

  async function save(status: "draft" | "published") {
    if (!values.title.trim()) {
      toast.error("শিরোনাম দিন");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: values.title.trim(),
        slug: values.slug.trim() || slugifyBangla(values.title),
        excerpt: values.excerpt,
        body: values.body,
        category_slug: values.category_slug,
        tags: values.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        image_url: values.image_url,
        image_caption: values.image_caption || null,
        author_name: values.author_name.trim() || "নিজস্ব প্রতিবেদক",
        is_lead: values.is_lead,
        is_featured: values.is_featured,
        status,
      };

      if (values.id) {
        await update({ data: { ...payload, id: values.id } });
      } else {
        await create({ data: payload });
      }
      toast.success(status === "published" ? "খবরটি প্রকাশিত হয়েছে" : "ড্রাফট সংরক্ষিত হয়েছে");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সংরক্ষণ করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">শিরোনাম</label>
        <input className={inputClass} value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="খবরের শিরোনাম" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">বিভাগ</label>
          <select className={inputClass} value={values.category_slug} onChange={(e) => set("category_slug", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">লেখকের নাম</label>
          <input className={inputClass} value={values.author_name} onChange={(e) => set("author_name", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">সংক্ষিপ্তসার</label>
        <textarea className={`${inputClass} min-h-20`} value={values.excerpt} onChange={(e) => set("excerpt", e.target.value)} placeholder="দুই-এক বাক্যে খবরের সারাংশ" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">মূল লেখা</label>
        <textarea className={`${inputClass} min-h-72 leading-relaxed`} value={values.body} onChange={(e) => set("body", e.target.value)} placeholder="অনুচ্ছেদ আলাদা করতে একটি ফাঁকা লাইন দিন" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">ট্যাগ (কমা দিয়ে আলাদা)</label>
          <input className={inputClass} value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="ঢাকা, পরিবহন" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ঠিকানা-নাম (খালি রাখলে নিজে তৈরি হবে)</label>
          <input className={inputClass} value={values.slug} onChange={(e) => set("slug", e.target.value)} placeholder="notun-khobor" />
        </div>
      </div>
      <div className="border border-border p-4">
        <label className="mb-2 block text-sm font-medium">খবরের ছবি</label>
        {values.image_url ? (
          <div className="mb-3">
            <img src={values.image_url} alt="" className="max-h-56 w-full object-cover" />
            <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => set("image_url", null)}>ছবি সরান</button>
          </div>
        ) : null}
        <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleUpload(file); }} className="text-sm" />
        {uploading && <p className="mt-2 text-sm text-muted-foreground">আপলোড হচ্ছে…</p>}
        <input className={`${inputClass} mt-3`} value={values.image_caption ?? ""} onChange={(e) => set("image_caption", e.target.value)} placeholder="ছবির ক্যাপশন" />
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={values.is_lead} onChange={(e) => set("is_lead", e.target.checked)} />
          প্রথম পাতার লিড খবর
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={values.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
          শীর্ষ খবর
        </label>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button type="button" disabled={saving} onClick={() => save("published")} className="bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-60">প্রকাশ করুন</button>
        <button type="button" disabled={saving} onClick={() => save("draft")} className="border border-border px-5 py-2 font-medium hover:bg-secondary disabled:opacity-60">ড্রাফট সংরক্ষণ</button>
      </div>
    </div>
  );
}
