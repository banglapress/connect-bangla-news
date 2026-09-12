import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getCategoryPage } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { RESERVED_SECTIONS, categoryName } from "@/lib/categories";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug],
    queryFn: () => getCategoryPage({ data: { slug } }),
  });

export const Route = createFileRoute("/$section")({
  beforeLoad: ({ params }) => {
    if (RESERVED_SECTIONS.includes(params.section)) {
      throw redirect({ to: "/" });
    }
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(categoryQuery(params.section)),
  head: ({ params }) => {
    const name = categoryName(params.section);
    return {
      meta: [
        { title: `${name} — The Connect` },
        { name: "description", content: `${name} বিভাগের সর্বশেষ বাংলা খবর।` },
      ],
    };
  },
  component: function SectionPage() {
    const { section } = Route.useParams();
    const { data } = useSuspenseQuery(categoryQuery(section));
    const name = data.category?.name ?? categoryName(section);
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="section-rule mb-6 pb-1">
          <h1 className="font-serif text-3xl font-bold">{name}</h1>
        </div>
        {data.articles.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            এই বিভাগে এখনো কোনো খবর প্রকাশিত হয়নি।{" "}
            <Link to="/" className="text-primary hover:underline">প্রথম পাতায় ফিরুন</Link>
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
  },
});
