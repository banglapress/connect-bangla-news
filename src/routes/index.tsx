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

  const lead = articles.find((article) => article.is_lead) ?? articles[0]!;
  const remaining = articles.filter((article) => article.id !== lead.id);
  const picked = remaining.filter((article) => article.is_featured);
  const pickedIds = new Set(picked.map((article) => article.id));
  const topStories = [...picked, ...remaining.filter((article) => !pickedIds.has(article.id))].slice(0, 6);
  const middleStories = topStories.slice(0, 4);
  const sideStories = topStories.slice(4, 6);
  const topStoryIds = new Set([lead.id, ...topStories.map((article) => article.id)]);

  const categorySections = CATEGORIES.map((cat) => ({
    cat,
    items: articles
      .filter((article) => article.category_slug === cat.slug && !topStoryIds.has(article.id))
      .slice(0, 6),
  })).filter((section) => section.items.length >= 2);

  return (
    <main className="mx-auto max-w-[1320px] px-4 py-4 md:px-6 md:py-6">
      <h1 className="sr-only">The Connect — বাংলা সংবাদ ও মতামত</h1>

      <section aria-label="প্রধান খবর" className="grid gap-5 border-b border-border pb-6 lg:grid-cols-12 lg:gap-4">
        <div className="min-w-0 lg:col-span-6 lg:border-r lg:border-border lg:pr-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-5 w-1 bg-primary" aria-hidden="true" />
            <h2 className="text-sm font-bold text-primary">প্রধান খবর</h2>
          </div>
          <ArticleCard article={lead} variant="lead" priority />
        </div>

        <div className="min-w-0 lg:col-span-3 lg:border-r lg:border-border lg:pr-4">
          <div className="mb-2 flex items-center justify-between border-b border-primary/50 pb-2">
            <h2 className="font-serif text-lg font-bold">আরও খবর</h2>
          </div>
          {middleStories.length > 0 ? (
            <div className="divide-y divide-border">
              {middleStories.map((article) => (
                <ArticleCard key={article.id} article={article} variant="list" />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">আরও খবর প্রকাশ হলে এখানে দেখা যাবে।</p>
          )}
        </div>

        <aside aria-label="নির্বাচিত খবর" className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
          {sideStories.map((article) => (
            <ArticleCard key={article.id} article={article} variant="compact" />
          ))}
        </aside>
      </section>

      {categorySections.map(({ cat, items }) => (
        <section key={cat.slug} className="mt-6 border-b border-border pb-6 md:mt-7 md:pb-7">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold leading-none text-primary-foreground" aria-hidden="true">−</span>
            <h2 className="shrink-0 font-serif text-lg font-bold text-primary md:text-xl">{cat.name}</h2>
            <div className="h-px min-w-0 flex-1 border-t border-dashed border-primary/70" aria-hidden="true" />
            <Link
              to="/category/$slug"
              params={{ slug: cat.slug }}
              className="shrink-0 text-xs font-semibold text-primary hover:text-foreground md:text-sm"
            >
              সব খবর <span aria-hidden="true">→</span>
            </Link>
          </div>

          {items.length >= 4 ? (
            <div className="grid gap-4 lg:grid-cols-12 lg:gap-3">
              <div className="min-w-0 lg:col-span-6 lg:border-r lg:border-border lg:pr-4">
                <ArticleCard article={items[0]!} variant="wide" />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1 lg:gap-3 lg:border-r lg:border-border lg:pr-3">
                {items.slice(1, 3).map((article) => (
                  <ArticleCard key={article.id} article={article} variant="compact" />
                ))}
              </div>
              <aside className="min-w-0 divide-y divide-border lg:col-span-3">
                {items.slice(3, 6).map((article) => (
                  <ArticleCard key={article.id} article={article} variant="list" />
                ))}
              </aside>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-12 lg:gap-4">
              <div className="min-w-0 lg:col-span-7 lg:border-r lg:border-border lg:pr-4">
                <ArticleCard article={items[0]!} variant="wide" />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5 lg:content-start">
                {items.slice(1).map((article) => (
                  <ArticleCard key={article.id} article={article} variant="compact" />
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
