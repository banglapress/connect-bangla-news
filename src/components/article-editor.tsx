import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createArticle, updateArticle } from "@/lib/admin.functions";
import { listCategories } from "@/lib/category.functions";
import { listWriters } from "@/lib/writer.functions";
import { slugifyBangla } from "@/lib/bangla";
import { uploadNewsImage } from "@/lib/upload-image";
import { CATEGORIES, type SiteCategory } from "@/lib/categories";
import { DraftCoverImage } from "@/components/draft-cover-image";

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
  image_urls?: string[];
  content_type?: "article" | "video";
  youtube_url?: string | null;
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
  image_urls: [],
  content_type: "article",
  youtube_url: "",
  author_name: "নিজস্ব প্রতিবেদক",
  is_lead: false,
  is_featured: false,
  status: "draft",
};

const inputClass = "w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary";

export function ArticleEditor({ initial }: { initial: EditorValues }) {
  const [values, setValues] = useState<EditorValues>({
    ...initial,
    image_urls: initial.image_urls?.length ? initial.image_urls : initial.image_url ? [initial.image_url] : [],
    content_type: initial.content_type ?? "article",
    youtube_url: initial.youtube_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();
  const create = useServerFn(createArticle);
  const update = useServerFn(updateArticle);
  const fetchCategories = useServerFn(listCategories);
  const fetchWriters = useServerFn(listWriters);
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const writersQuery = useQuery({ queryKey: ["writers"], queryFn: () => fetchWriters() });
  const categories: SiteCategory[] = categoriesQuery.data?.length ? categoriesQuery.data : CATEGORIES;
  const writers = writersQuery.data ?? [];

  function set<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadNewsImage(file);
      setValues((v) => {
        const image_urls = [...(v.image_urls ?? []), url];
        return { ...v, image_urls, image_url: v.image_url || url };
      });
      toast.success("ছবি যুক্ত হয়েছে");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ছবি আপলোড করা যায়নি");
    } finally {
      setUploading(false);
    }
  }

  function insertImageToken(index: number) {
    const token = `{{image:${index + 1}}}`;
    setValues((v) => ({ ...v, body: v.body ? `${v.body}\n\n${token}\n\n` : `${token}\n\n` }));
    toast.success("লেখায় ছবির চিহ্ন বসানো হয়েছে");
  }

  async function save(status: "draft" | "published") {
    if (!values.title.trim()) {
      toast.error("শিরোনাম দিন");
      return;
    }
    setSaving(true);
    try {
      const image_urls = values.image_urls ?? [];
      const payload = {
        title: values.title.trim(),
        slug: values.slug.trim() || slugifyBangla(values.title),
        excerpt: values.excerpt,
        body: values.body,
        category_slug: values.category_slug,
        tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean),
        image_url: values.image_url || image_urls[0] || null,
        image_caption: values.image_caption || null,
        image_urls,
        content_type: values.content_type ?? "article",
        youtube_url: values.youtube_url || null,
        author_name: values.author_name.trim() || "নিজস্ব প্রতিবেদক",
        is_lead: values.is_lead,
        is_featured: values.is_featured,
        status,
      };
      if (values.id) await update({ data: { ...payload, id: values.id } });
      else await create({ data: payload });
      toast.success(status === "published" ? "খবরটি প্রকাশিত হয়েছে" : "ড্রাফট সংরক্ষিত হয়েছে");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সংরক্ষণ করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  const parents = categories.filter((c) => !c.parent_id);
  const children = categories.filter((c) => c.parent_id);

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">শিরোনাম</label>
        <input className={inputClass} value={values.title} onChange={(e) => set("title", e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">ক্যাটেগরি / সাব-ক্যাটেগরি</label>
          <select className={inputClass} value={values.category_slug} onChange={(e) => set("category_slug", e.target.value)}>
            {parents.map((parent) => (
              <optgroup key={parent.slug} label={parent.name}>
                <option value={parent.slug}>{parent.name}</option>
                {children.filter((child) => child.parent_id === parent.id).map((child) => (
                  <option key={child.slug} value={child.slug}>— {child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">কনটেন্ট টাইপ</label>
          <select className={inputClass} value={values.content_type ?? "article"} onChange={(e) => set("content_type", e.target.value as "article" | "video")}>
            <option value="article">সাধারণ খবর (ছবি)</option>
            <option value="video">ভিডিও</option>
          </select>
        </div>
      </div>
      {values.content_type === "video" && (
        <div>
          <label className="mb-1 block text-sm font-medium">YouTube লিংক বা এমবেড কোড</label>
          <textarea className={`${inputClass} min-h-20`} value={values.youtube_url ?? ""} onChange={(e) => set("youtube_url", e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">সংক্ষিপ্তসার</label>
        <textarea className={`${inputClass} min-h-20`} value={values.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">মূল লেখা</label>
        <textarea className={`${inputClass} min-h-72 leading-relaxed`} value={values.body} onChange={(e) => set("body", e.target.value)} placeholder="ভেতরের ছবির জন্য {{image:1}} লিখুন" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">লেখক</label>
          <select
            className={inputClass}
            value={writers.some((w) => w.name === values.author_name) ? values.author_name : "__custom"}
            onChange={(e) => {
              if (e.target.value !== "__custom") set("author_name", e.target.value);
            }}
          >
            <option value="__custom">নাম নিজে লিখুন</option>
            {writers.map((w) => (
              <option key={w.slug} value={w.name}>{w.name}{w.managed_by_desk ? " (ডেস্ক)" : ""}</option>
            ))}
          </select>
          <input className={`${inputClass} mt-2`} value={values.author_name} onChange={(e) => set("author_name", e.target.value)} placeholder="লেখকের নাম" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ট্যাগ</label>
          <input className={inputClass} value={values.tags} onChange={(e) => set("tags", e.target.value)} />
        </div>
      </div>
      {values.id ? (
        <DraftCoverImage
          articleId={values.id}
          onApplied={(url) =>
            setValues((v) => ({
              ...v,
              image_url: url,
              image_urls: [url, ...(v.image_urls ?? []).filter((item) => item !== url)],
            }))
          }
        />
      ) : null}
      <div className="border border-border p-4">
        <label className="mb-2 block text-sm font-medium">ছবি (একাধিক)</label>
        <p className="mb-3 text-xs text-muted-foreground">প্রথম ছবি কভার। নির্দিষ্ট জায়গায় দেখাতে “লেখায় বসাও” চাপুন।</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(values.image_urls ?? []).map((url, index) => (
            <div key={`${url}-${index}`} className="border border-border p-2">
              <img src={url} alt="" className="mb-2 h-28 w-full object-cover" />
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => insertImageToken(index)}>লেখায় বসাও</button>
                <button type="button" className="text-primary hover:underline" onClick={() => set("image_url", url)}>কভার</button>
                <button type="button" className="text-destructive hover:underline" onClick={() => setValues((v) => {
                  const next = (v.image_urls ?? []).filter((_, i) => i !== index);
                  return { ...v, image_urls: next, image_url: v.image_url === url ? next[0] ?? null : v.image_url };
                })}>সরান</button>
              </div>
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" disabled={uploading} className="mt-3 text-sm" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = "";
        }} />
        {uploading && <p className="mt-2 text-sm text-muted-foreground">আপলোড হচ্ছে…</p>}
        <input className={`${inputClass} mt-3`} value={values.image_caption ?? ""} onChange={(e) => set("image_caption", e.target.value)} placeholder="কভার ছবির ক্যাপশন" />
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
