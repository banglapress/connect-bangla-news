import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteArticle, getMyAccess, listAllArticles } from "@/lib/admin.functions";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate } from "@/lib/bangla";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "সম্পাদকীয় প্যানেল — The Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchArticles = useServerFn(listAllArticles);
  const removeArticle = useServerFn(deleteArticle);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const articles = useQuery({
    queryKey: ["admin-articles"],
    queryFn: () => fetchArticles(),
    enabled: access.data?.isStaff === true,
  });

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

  if (access.isLoading) {
    return <p className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">অপেক্ষা করুন…</p>;
  }

  if (access.isError) {
    const message = access.error instanceof Error ? access.error.message : "অজানা ত্রুটি";
    const needsLogin = /unauthorized|authorization|token/i.test(message);
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">অনুমতি যাচাই করা যায়নি</h1>
        <p className="mt-3 text-muted-foreground">
          {needsLogin
            ? "এই ডোমেইনে লগইন তথ্য পাওয়া যায়নি। কাস্টম ডোমেইনে আলাদা করে আবার প্রবেশ করুন।"
            : "সার্ভার থেকে ভূমিকা পড়া যায়নি। নিচে আসল কারণ দেওয়া আছে।"}
        </p>
        <p className="mt-3 break-words text-sm text-destructive">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => void access.refetch()}
            className="bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            আবার চেষ্টা করুন
          </button>
          <button onClick={signOut} className="border border-border px-4 py-2 text-sm">
            সাইন আউট
          </button>
        </div>
      </div>
    );
  }

  if (!access.data?.isStaff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">আপনার লেখার অনুমতি নেই</h1>
        <p className="mt-3 text-muted-foreground">
          খবর লিখতে হলে অ্যাডমিনকে বলুন আপনাকে সম্পাদক হিসেবে যুক্ত করতে।
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          অন্য ডোমেইনে অ্যাডমিন থাকলেও এই সাইটে অন্য ইমেইল দিয়ে প্রবেশ করলে ভূমিকা থাকবে না।
        </p>
        <button onClick={signOut} className="mt-6 text-primary hover:underline">
          সাইন আউট
        </button>
      </div>
    );
  }

  const rows = (articles.data ?? []).filter((a) => filter === "all" || a.status === filter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">সম্পাদকীয় প্যানেল</h1>
        <div className="flex gap-3">
          {access.data.roles.includes("admin") && (
            <Link to="/admin/users" className="border border-border px-4 py-2 text-sm hover:bg-secondary">
              ব্যবহারকারী
            </Link>
          )}
          <Link to="/admin/new" className="bg-primary px-4 py-2 text-sm text-primary-foreground">
            নতুন খবর
          </Link>
          <button onClick={signOut} className="border border-border px-4 py-2 text-sm">
            সাইন আউট
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        {(
          [
            ["all", "সব"],
            ["published", "প্রকাশিত"],
            ["draft", "ড্রাফট"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`border px-3 py-1 ${
              filter === key ? "border-primary text-primary" : "border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {articles.isLoading ? (
        <p className="py-10 text-muted-foreground">খবর আনা হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-muted-foreground">কোনো খবর নেই।</p>
      ) : (
        <div className="mt-6 divide-y divide-border border border-border">
          {rows.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryName(a.category_slug)} ·{" "}
                  {a.status === "published"
                    ? `প্রকাশিত ${formatBanglaDate(a.published_at)}`
                    : "ড্রাফট"}
                </p>
              </div>
              <Link
                to="/admin/$id/edit"
                params={{ id: a.id }}
                className="border border-border px-3 py-1 text-sm hover:bg-secondary"
              >
                সম্পাদনা
              </Link>
              {a.status === "published" && (
                <Link
                  to="/news/$slug"
                  params={{ slug: a.slug }}
                  className="px-2 text-sm text-primary hover:underline"
                >
                  দেখুন
                </Link>
              )}
              <button
                onClick={() => handleDelete(a.id, a.title)}
                className="px-2 text-sm text-destructive hover:underline"
              >
                মুছুন
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
