import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticle } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { categoryName } from "@/lib/categories";
import { formatBanglaDateTime } from "@/lib/bangla";
import { publicImageUrl } from "@/lib/image";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["article", slug],
    queryFn: () => getArticle({ data: { slug } }),
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
    return { meta };
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
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_1fr]">
        <article>
          <Link
            to="/category/$slug"
            params={{ slug: article.category_slug }}
            className="text-xs font-bold uppercase tracking-widest text-primary"
          >
            {data.category?.name ?? categoryName(article.category_slug)}
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p>
          ) : null}
          <p className="mt-4 border-y border-border py-2 text-sm text-muted-foreground">
            {article.author_name} · {formatBanglaDateTime(article.published_at)}
          </p>

          {image ? (
            <figure className="mt-6">
              <img
                src={image}
                alt={article.image_caption ?? article.title}
                className="w-full object-cover"
              />
              {article.image_caption ? (
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  {article.image_caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div className="article-body mt-6">
            {article.body
              .split(/\n{2,}/)
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </div>

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

        <aside>
          <h2 className="section-rule pb-1 font-serif text-lg font-bold">সম্পর্কিত খবর</h2>
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
