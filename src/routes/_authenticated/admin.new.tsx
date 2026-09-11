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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="section-rule flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">নতুন খবর</h1>
        <Link to="/admin" className="text-sm text-primary hover:underline">
          ফিরে যান
        </Link>
      </div>
      <div className="mt-6">
        <ArticleEditor initial={emptyArticle} />
      </div>
    </div>
  );
}
