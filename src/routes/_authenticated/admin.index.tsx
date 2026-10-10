import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteArticle, getMyAccess, listAllArticles, updateArticleQuickly } from "@/lib/admin.functions";
import { CATEGORIES, categoryName } from "@/lib/categories";
import { listCategories } from "@/lib/category.functions";
import { listWriters } from "@/lib/writer.functions";
import { formatBanglaDate } from "@/lib/bangla";
import { DeskAutoControls } from "@/components/desk-auto-controls";

type QuickEditValues = {
  id: string;
  title: string;
  category_slug: string;
  author_name: string;
  is_lead: boolean;
  is_featured: boolean;
  tags: string;
};

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "সম্পাদকীয় প্যানেল — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchArticles = useServerFn(listAllArticles);
  const removeArticle = useServerFn(deleteArticle);
  const saveQuickEdit = useServerFn(updateArticleQuickly);
  const fetchCategories = useServerFn(listCategories);
  const fetchWriters = useServerFn(listWriters);
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "ai">("all");
  const [quickEdit, setQuickEdit] = useState<QuickEditValues | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const articles = useQuery({ queryKey: ["admin-articles"], queryFn: () => fetchArticles(), enabled: access.data?.isStaff === true });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const writers = useQuery({ queryKey: ["writers"], queryFn: () => fetchWriters() });
  const categoryOptions = categories.data?.length ? categories.data : CATEGORIES;

  function openQuickEdit(article: NonNullable<typeof articles.data>[number]) {
    setQuickEdit({
      id: article.id,
      title: article.title,
      category_slug: article.category_slug,
      author_name: String(article.author_name ?? ""),
      is_lead: Boolean(article.is_lead),
      is_featured: Boolean(article.is_featured),
      tags: Array.isArray(article.tags) ? article.tags.join(", ") : "",
    });
  }

  async function handleQuickEditSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickEdit) return;
    setQuickEditSaving(true);
    try {
      await saveQuickEdit({
        data: {
          id: quickEdit.id,
          category_slug: quickEdit.category_slug,
          author_name: quickEdit.author_name.trim(),
          is_lead: quickEdit.is_lead,
          is_featured: quickEdit.is_featured,
          tags: quickEdit.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        },
      });
      toast.success("খবরের তথ্য আপডেট হয়েছে");
      setQuickEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "কুইক এডিট সংরক্ষণ করা যায়নি");
    } finally {
      setQuickEditSaving(false);
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`“${title}” মুছে ফেলবেন?`)) return;
    try {
      await removeArticle({ data: { id } });
      toast.success("খবরটি মুছে ফেলা হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    } catch {
      toast.error("মুছে ফেলা যায়নি");
    }
  }

  if (access.isLoading) return <p className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">অপেক্ষা করুন…</p>;
  if (access.isError) {
    const message = access.error instanceof Error ? access.error.message : "অজানা ত্রুটি";
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">অনুমতি যাচাই করা যায়নি</h1>
        <p className="mt-3 break-words text-sm text-destructive">{message}</p>
        <button onClick={signOut} className="mt-6 border border-border px-4 py-2 text-sm">সাইন আউট</button>
      </div>
    );
  }
  if (!access.data?.isStaff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">আপনার লেখার অনুমতি নেই</h1>
        <button onClick={signOut} className="mt-6 text-primary hover:underline">সাইন আউট</button>
      </div>
    );
  }

  const articleRows = articles.data ?? [];
  const rows = articleRows.filter((a) => {
    if (filter === "ai") return Boolean(a.ai_story_id);
    return filter === "all" || a.status === filter;
  });
  const aiCount = articleRows.filter((a) => Boolean(a.ai_story_id)).length;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">সম্পাদকীয় প্যানেল</h1>
        <div className="flex flex-wrap gap-3">
          {access.data.roles.includes("admin") && <Link to="/admin/users" className="border border-border px-4 py-2 text-sm hover:bg-secondary">ব্যবহারকারী</Link>}
          {access.data.roles.includes("admin") && <Link to="/admin/categories" className="border border-border px-4 py-2 text-sm hover:bg-secondary">ক্যাটেগরি</Link>}
          <Link to="/admin/writers" className="border border-border px-4 py-2 text-sm hover:bg-secondary">লেখক</Link>
          <a href="/admin/desk" className="border border-border px-4 py-2 text-sm hover:bg-secondary">এআই ডেস্ক</a>
          <Link to="/admin/facebook-cards" className="border border-border px-4 py-2 text-sm hover:bg-secondary">ফেসবুক ফটোকার্ড</Link>
          <Link to="/admin/new" className="bg-primary px-4 py-2 text-sm text-primary-foreground">নতুন খবর</Link>
          <button onClick={signOut} className="border border-border px-4 py-2 text-sm">সাইন আউট</button>
        </div>
      </div>
      <div className="mt-6">
        <DeskAutoControls />
      </div>
      <div className="mt-4 flex gap-2 text-sm">
        {([["all", "সব"], ["published", "প্রকাশিত"], ["draft", "ড্রাফট"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className={`border px-3 py-1 ${filter === key ? "border-primary text-primary" : "border-border"}`}>{label}</button>
        ))}
      </div>
      {articles.isLoading ? <p className="py-10 text-muted-foreground">খবর আনা হচ্ছে…</p> : rows.length === 0 ? <p className="py-10 text-muted-foreground">কোনো খবর নেই।</p> : (
        <div className="mt-6 divide-y divide-border border border-border">
          {rows.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.ai_story_id ? "🤖 AI নিউজ · " : ""}{categoryName(a.category_slug, categoryOptions)} · {a.author_name || "লেখক নেই"} · {a.is_lead ? "লিড নিউজ · " : ""}{a.is_featured ? "ফিচার্ড · " : ""}{a.status === "published" ? `প্রকাশিত ${formatBanglaDate(a.published_at)}` : "ড্রাফট"}</p>
              </div>
              <button type="button" onClick={() => openQuickEdit(a)} className="border border-primary/40 px-3 py-1 text-sm text-primary hover:bg-primary/5">কুইক এডিট</button>
              <Link to="/admin/$id/edit" params={{ id: a.id }} className="border border-border px-3 py-1 text-sm hover:bg-secondary">সম্পাদনা</Link>
              <button onClick={() => handleDelete(a.id, a.title)} className="px-2 text-sm text-destructive hover:underline">মুছুন</button>
            </div>
          ))}
        </div>
      )}
      {quickEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="quick-edit-title" className="my-auto w-full max-w-xl rounded-xl border border-border bg-background shadow-xl">
            <form onSubmit={handleQuickEditSave}>
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="min-w-0">
                  <h2 id="quick-edit-title" className="font-serif text-xl font-bold">কুইক এডিট</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{quickEdit.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">শুধু ক্যাটেগরি, লেখক, অবস্থান ও ট্যাগ বদলাবে—মূল লেখা ও ছবি অপরিবর্তিত থাকবে।</p>
                </div>
                <button type="button" onClick={() => setQuickEdit(null)} aria-label="বন্ধ করুন" className="rounded-md border border-border px-2 py-1 text-sm">বন্ধ</button>
              </div>
              <div className="space-y-4 p-5">
                <label className="block text-sm font-medium">
                  ক্যাটেগরি
                  <select
                    required
                    value={quickEdit.category_slug}
                    onChange={(event) => setQuickEdit((current) => current ? { ...current, category_slug: event.target.value } : current)}
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 font-normal"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category.slug} value={category.slug}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  লেখক / প্রতিবেদক
                  <input
                    required
                    list="quick-edit-writers"
                    value={quickEdit.author_name}
                    onChange={(event) => setQuickEdit((current) => current ? { ...current, author_name: event.target.value } : current)}
                    placeholder="লেখকের নাম লিখুন বা তালিকা থেকে বাছুন"
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 font-normal"
                  />
                  <datalist id="quick-edit-writers">
                    {(writers.data ?? []).map((writer) => <option key={writer.id || writer.slug} value={writer.name} />)}
                  </datalist>
                </label>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">হোমপেজে অবস্থান</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={quickEdit.is_lead}
                        onChange={(event) => setQuickEdit((current) => current ? { ...current, is_lead: event.target.checked } : current)}
                      />
                      <span><span className="block font-medium">লিড নিউজ</span><span className="text-xs text-muted-foreground">প্রধান খবর হিসেবে দেখান</span></span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={quickEdit.is_featured}
                        onChange={(event) => setQuickEdit((current) => current ? { ...current, is_featured: event.target.checked } : current)}
                      />
                      <span><span className="block font-medium">ফিচার্ড</span><span className="text-xs text-muted-foreground">বিশেষভাবে হাইলাইট করুন</span></span>
                    </label>
                  </div>
                </fieldset>
                <label className="block text-sm font-medium">
                  ট্যাগ
                  <input
                    value={quickEdit.tags}
                    onChange={(event) => setQuickEdit((current) => current ? { ...current, tags: event.target.value } : current)}
                    placeholder="কমা দিয়ে আলাদা করুন"
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 font-normal"
                  />
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">যেমন: বাংলাদেশ, রাজনীতি, অর্থনীতি</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-border p-5">
                <button type="button" onClick={() => setQuickEdit(null)} disabled={quickEditSaving} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60">বাতিল</button>
                <button type="submit" disabled={quickEditSaving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                  {quickEditSaving ? "সংরক্ষণ হচ্ছে…" : "পরিবর্তন সংরক্ষণ"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

