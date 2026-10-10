import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getHomeData } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { CATEGORIES } from "@/lib/categories";
import { responsiveImageSources } from "@/lib/image";

const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHomeData(),
  staleTime: 30_000,
  gcTime: 120_000,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQuery),
  head: ({ loaderData }) => {
    const articles = loaderData?.articles ?? [];
    const lead = articles.find((article) => article.is_lead) ?? articles[0];
    const heroImage = responsiveImageSources(lead?.image_url);
    const links = heroImage
      ? [{
          rel: "preload",
          as: "image",
          href: heroImage.src,
          ...(heroImage.srcSet ? { imageSrcSet: heroImage.srcSet } : {}),
          imageSizes: "(max-width: 768px) 100vw, 800px",
        }]
      : [];

    return {
      meta: [
        { title: "The Connect — বাংলা সংবাদ ও মতামতের পোর্টাল" },
        {
          name: "description",
          content: "The Connect-এ পড়ুন জাতীয়, আন্তর্জাতিক, খেলা, অর্থনীতি, মতামতসহ দিনের সব গুরুত্বপূর্ণ বাংলা খবর ও বিশ্লেষণ।",
        },
        { property: "og:title", content: "The Connect — বাংলা সংবাদ ও মতামত" },
        { property: "og:description", content: "দিনের সব গুরুত্বপূর্ণ বাংলা খবর, বিশ্লেষণ ও কলাম এক জায়গায়।" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links,
    };
  },
  component: Home,
});

function Home() {
  const { data } = useSuspenseQuery(homeQuery);
  const articles = data.articles;

  if (articles.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold">এখনো কোনো খবর প্রকাশিত হয়নি</h1>
        <p className="mt-3 text-muted-foreground">সম্পাদকীয় প্যানেলে প্রবেশ করে প্রথম খবরটি প্রকাশ করুন।</p>
      </div>
    );
  }

  const lead = articles.find((a) => a.is_lead) ?? articles[0]!;
  const featured = articles.filter((a) => a.id !== lead.id && a.is_featured).slice(0, 4);
  const usedIds = new Set([lead.id, ...featured.map((a) => a.id)]);
  const categorySections = CATEGORIES.map((cat) => {
    const items = articles.filter((a) => a.category_slug === cat.slug && !usedIds.has(a.id)).slice(0, 3);
    items.forEach((a) => usedIds.add(a.id));
    return { cat, items };
  }).filter((section) => section.items.length > 0);

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-5 md:px-6 md:py-7">
      <h1 className="sr-only">The Connect — বাংলা সংবাদ ও মতামত</h1>

      <section className="grid gap-6 border-b border-border pb-7 lg:grid-cols-12 lg:gap-7">
        <div className="min-w-0 lg:col-span-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 bg-primary" />
            <h2 className="text-sm font-bold tracking-wide">প্রধান খবর</h2>
          </div>
          <ArticleCard article={lead} variant="lead" priority />
        </div>

        <aside className="min-w-0 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between border-b-2 border-foreground pb-2">
            <h2 className="font-serif text-xl font-bold md:text-2xl">সম্পাদকের পছন্দ</h2>
            <span className="text-xs text-muted-foreground">বাছাই করা খবর</span>
          </div>
          {featured.length > 0 ? (
            <div className="divide-y divide-border">
              {featured.map((a) => (
                <ArticleCard key={a.id} article={a} variant="list" />
              ))}
            </div>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">সম্পাদকের বাছাই করা খবর শিগগিরই এখানে দেখানো হবে।</p>
          )}
        </aside>
      </section>

      {categorySections.map(({ cat, items }) => (
        <section key={cat.slug} className="mt-8 md:mt-10">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-foreground pb-2">
            <h2 className="font-serif text-xl font-bold md:text-2xl">{cat.name}</h2>
            <Link
              to="/category/$slug"
              params={{ slug: cat.slug }}
              className="text-sm font-semibold text-primary transition-colors hover:text-foreground"
            >
              সব খবর <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      ))}
    </div>
  );
}