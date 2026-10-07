import { createFileRoute, Link } from "@tanstack/react-router";
import { ArticleEditor, emptyArticle } from "@/components/article-editor";

export const Route = createFileRoute("/_authenticated/admin/new")({
  head: () => ({
    meta: [{ title: "নতুন খবর — The Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: NewArticle,
});

function NewArticle() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="section-rule flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">নতুন খবর</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link to="/admin/desk" className="border border-border px-3 py-2 hover:bg-secondary">
            AI Newsroom
          </Link>
          <Link to="/admin/facebook-cards" className="border border-border px-3 py-2 hover:bg-secondary">
            Facebook Photo Cards
          </Link>
          <Link to="/admin" className="text-primary hover:underline">
            ফিরে যান
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <ArticleEditor initial={emptyArticle} />
      </div>
    </div>
  );
}
