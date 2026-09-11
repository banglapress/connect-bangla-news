import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArticleEditor, type EditorValues } from "@/components/article-editor";
import { getArticleForEdit } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/$id/edit")({
  head: () => ({
    meta: [{ title: "খবর সম্পাদনা — The Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: EditArticle,
});

function EditArticle() {
  const { id } = Route.useParams();
  const fetchArticle = useServerFn(getArticleForEdit);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-article", id],
    queryFn: () => fetchArticle({ data: { id } }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="section-rule flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">খবর সম্পাদনা</h1>
        <Link to="/admin" className="text-sm text-primary hover:underline">
          ফিরে যান
        </Link>
      </div>

      {isLoading ? (
        <p className="py-10 text-muted-foreground">আনা হচ্ছে…</p>
      ) : !data ? (
        <p className="py-10 text-muted-foreground">খবরটি পাওয়া যায়নি।</p>
      ) : (
        <div className="mt-6">
          <ArticleEditor
            initial={
              {
                id: data.id,
                title: data.title,
                slug: data.slug,
                excerpt: data.excerpt ?? "",
                body: data.body,
                category_slug: data.category_slug,
                tags: data.tags.join(", "),
                image_url: data.image_url,
                image_caption: data.image_caption ?? "",
                author_name: data.author_name,
                is_lead: data.is_lead,
                is_featured: data.is_featured,
                status: data.status as "draft" | "published",
              } satisfies EditorValues
            }
          />
        </div>
      )}
    </div>
  );
}
