import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getCategoryPage } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { categoryName } from "@/lib/categories";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug],
    queryFn: () => getCategoryPage({ data: { slug } }),
  });

export const Route = createFileRoute("/category/$slug")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(categoryQuery(params.slug)),
  head: ({ params }) => {
    const name = categoryName(params.slug);
    return {
      meta: [
        { title: `${name} — The Connect` },
        {
          name: "description",
          content: `${name} বিভাগের সর্বশেষ বাংলা খবর, প্রতিবেদন ও বিশ্লেষণ পড়ুন The Connect-এ।`,
        },
        { property: "og:title", content: `${name} — The Connect` },
        {
          property: "og:description",
          content: `${name} বিভাগের সর্বশেষ খবর ও বিশ্লেষণ।`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="text-muted-foreground">এই বিভাগের খবর আনা যায়নি। একটু পরে আবার চেষ্টা করুন।</p>
    </div>
  ),
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const name = data.category?.name ?? categoryName(slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="section-rule mb-6 pb-1">
        <h1 className="font-serif text-3xl font-bold">{name}</h1>
      </div>

      {data.articles.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          এই বিভাগে এখনো কোনো খবর প্রকাশিত হয়নি।{" "}
          <Link to="/" className="text-primary hover:underline">
            প্রথম পাতায় ফিরুন
          </Link>
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
