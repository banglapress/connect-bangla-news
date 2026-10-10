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
          content:
            "The Connect-এ পড়ুন জাতীয়, আন্তর্জাতিক, খেলা, অর্থনীতি, মতামতসহ দিনের সব গুরুত্বপূর্ণ বাংলা খবর ও বিশ্লেষণ।",
        },
        { property: "og:title", content: "The Connect — বাংলা সংবাদ ও মতামত" },
        {
          property: "og:description",
          content: "দিনের সব গুরুত্বপূর্ণ বাংলা খবর, বিশ্লেষণ ও কলাম এক জায়গায়।",
        },
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
        <p className="mt-3 text-muted-foreground">
          সম্পাদকীয় প্যানেলে প্রবেশ করে প্রথম খবরটি প্রকাশ করুন।
        </p>
      </div>
    );
  }

  const lead = articles.find((a) => a.is_lead) ?? articles[0]!;
  const rest = articles.filter((a) => a.id !== lead.id);
  const secondary = rest.slice(0, 4);
  const latest = rest.filter((a) => !secondary.some((item) => item.id === a.id)).slice(0, 8);

  // A story should appear only once on the homepage, even when it belongs
  // to the opinion or a category section as well as the lead/latest feed.
  const usedIds = new Set([lead.id, ...secondary.map((a) => a.id), ...latest.map((a) => a.id)]);
  const opinion = articles
    .filter((a) => a.category_slug === "opinion" && !usedIds.has(a.id))
    .slice(0, 4);
  opinion.forEach((a) => usedIds.add(a.id));

  const categorySections = CATEGORIES.map((cat) => {
    const items = articles
      .filter((a) => a.category_slug === cat.slug && !usedIds.has(a.id))
      .slice(0, 3);
    items.forEach((a) => usedIds.add(a.id));
    return { cat, items };
  }).filter((section) => section.items.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 md:py-8">
      <h1 className="sr-only">The Connect — বাংলা সংবাদ ও মতামত</h1>

      <div className="mb-6 flex items-center gap-3 border-b border-border pb-3">
        <span className="h-7 w-1.5 rounded-full bg-primary" />
        <div>
          <p className="text-xs font-bold tracking-wide text-primary">THE CONNECT · সংবাদ ও বিশ্লেষণ</p>
          <p className="mt-0.5 text-sm text-muted-foreground">দিনের গুরুত্বপূর্ণ খবর, এক জায়গায়</p>
        </div>
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.8fr)] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-sm bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">প্রধান খবর</span>
            <span className="text-xs text-muted-foreground">সম্পাদকের নির্বাচিত</span>
          </div>
          <ArticleCard article={lead} variant="lead" priority />
          {secondary.length > 0 && (
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {secondary.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          )}
        </div>

        <aside className="min-w-0 rounded-xl border border-border bg-card px-4 py-2 md:px-5">
          <div className="flex items-center justify-between border-b-2 border-primary pb-3 pt-2">
            <h2 className="font-serif text-xl font-bold">সর্বশেষ খবর</h2>
            <span className="text-xs text-muted-foreground">নতুন থেকে পুরোনো</span>
          </div>
          <div>
            {latest.map((a) => (
              <ArticleCard key={a.id} article={a} variant="list" />
            ))}
          </div>
        </aside>
      </div>

      {opinion.length > 0 && (
        <section className="mt-10 rounded-xl border border-border bg-secondary/60 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between border-b-2 border-primary pb-2">
            <h2 className="font-serif text-xl font-bold">মতামত</h2>
            <span className="text-xs text-muted-foreground">বিশ্লেষণ ও দৃষ্টিভঙ্গি</span>
          </div>
          <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
            {opinion.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}

      {categorySections.map(({ cat, items }) => (
        <section key={cat.slug} className="mt-10 md:mt-12">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-foreground pb-2">
            <h2 className="font-serif text-xl font-bold md:text-2xl">{cat.name}</h2>
            <Link
              to="/category/$slug"
              params={{ slug: cat.slug }}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
            >
              সব খবর দেখুন →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      ))}
    </div>
  );
}