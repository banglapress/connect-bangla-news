import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticle } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { categoryName } from "@/lib/categories";
import { formatBanglaDateTime } from "@/lib/bangla";
import { publicImageUrl, responsiveImageSources } from "@/lib/image";
import { renderArticleBody } from "@/lib/article-html";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["article", slug],
    queryFn: () => getArticle({ data: { slug } }),
    staleTime: 30_000,
    gcTime: 120_000,
  });

export const Route = createFileRoute("/news/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(articleQuery(params.slug));
    if (!data.article) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.article) {
      return {
        meta: [
          { title: "খবরটি পাওয়া যায়নি — The Connect" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const a = loaderData.article;
    const description = a.excerpt ?? a.body.slice(0, 150);
    const image = publicImageUrl(a.image_url);
    const responsiveImage = responsiveImageSources(a.image_url);
    const meta = [
      { title: `${a.title} — The Connect` },
      { name: "description", content: description },
      { property: "og:title", content: a.title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (image?.startsWith("https://")) {
      meta.push(
        { property: "og:image", content: image },
        { name: "twitter:image", content: image },
      );
    }
    const links = responsiveImage
      ? [{
          rel: "preload",
          as: "image",
          href: responsiveImage.src,
          ...(responsiveImage.srcSet ? { imageSrcSet: responsiveImage.srcSet } : {}),
          imageSizes: "(max-width: 768px) 100vw, 800px",
        }]
      : [];
    return { meta, links };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold">খবরটি পাওয়া যায়নি</h1>
      <p className="mt-3 text-muted-foreground">সম্ভবত এটি সরিয়ে ফেলা হয়েছে বা ঠিকানা ভুল।</p>
      <Link to="/" className="mt-6 inline-block text-primary hover:underline">
        প্রথম পাতায় ফিরুন
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <p className="text-muted-foreground">খবরটি আনা যায়নি। একটু পরে আবার চেষ্টা করুন।</p>
    </div>
  ),
  component: ArticlePage,
});

function ArticlePage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(articleQuery(slug));
  const article = data.article!;
  const image = publicImageUrl(article.image_url);
  const responsiveImage = responsiveImageSources(article.image_url);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt ?? "",
    datePublished: article.published_at,
    author: { "@type": "Person", name: article.author_name },
    publisher: { "@type": "Organization", name: "The Connect" },
    ...(image ? { image: [image] } : {}),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
      <div className="grid gap-10 md:grid-cols-[minmax(0,760px)_minmax(250px,1fr)] md:gap-14">
        <article>
          <Link
            to="/category/$slug"
            params={{ slug: article.category_slug }}
            className="text-xs font-bold uppercase tracking-widest text-primary"
          >
            {data.category?.name ?? categoryName(article.category_slug)}
          </Link>
          <h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.25] tracking-tight md:text-5xl">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl">{article.excerpt}</p>
          ) : null}
          <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-border py-3 text-sm text-muted-foreground">
            {article.author_name} · {formatBanglaDateTime(article.published_at)}
          </p>

          {image ? (
            <figure className="mt-7">
              <img
                src={responsiveImage?.src ?? image}
                srcSet={responsiveImage?.srcSet}
                sizes="(max-width: 768px) 100vw, 800px"
                alt={article.image_caption ?? article.title}
                width={1200}
                height={675}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="aspect-video w-full rounded-sm object-cover"
              />
              {article.image_caption ? (
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  {article.image_caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div
            className="article-body mt-7 md:mt-9"
            dangerouslySetInnerHTML={{ __html: renderArticleBody(article.body) }}
          />

          {article.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {article.tags.map((t) => (
                <span key={t} className="bg-secondary px-2 py-1 text-xs text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </article>

        <aside className="md:sticky md:top-40 md:self-start">
          <h2 className="mb-2 border-b-2 border-foreground pb-2 font-serif text-xl font-bold">সম্পর্কিত খবর</h2>
          {data.related.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">সম্পর্কিত কোনো খবর নেই।</p>
          ) : (
            data.related.map((a) => <ArticleCard key={a.id} article={a} variant="list" />)
          )}
        </aside>
      </div>
    </div>
  );
}
