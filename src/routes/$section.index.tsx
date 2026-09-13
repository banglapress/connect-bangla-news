import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getArticle, getCategoryPage } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { ArticleMedia } from "@/components/article-media";
import { categoryName } from "@/lib/categories";
import { formatBanglaDateTime } from "@/lib/bangla";
import { renderArticleBody } from "@/lib/body-render";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["category", slug],
    queryFn: () => getCategoryPage({ data: { slug } }),
  });

const articleQuery = (uid: string) =>
  queryOptions({
    queryKey: ["article", uid],
    queryFn: () => getArticle({ data: { slug: uid } }),
  });

export const Route = createFileRoute("/$section/")({
  loader: async ({ context, params }) => {
    const key = decodeURIComponent(params.section || "");
    const story = await context.queryClient.ensureQueryData(articleQuery(key));
    if (story.article) {
      return { kind: "article" as const, key, pageTitle: `${story.article.title} — The Connect` };
    }
    const page = await context.queryClient.ensureQueryData(categoryQuery(key));
    if (page.category || page.articles.length) {
      const name = page.category?.name ?? categoryName(key);
      return { kind: "category" as const, key, pageTitle: `${name} — The Connect` };
    }
    throw notFound();
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { title: loaderData?.pageTitle || "The Connect" },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold">পাতাটি পাওয়া যায়নি</h1>
      <Link to="/" className="mt-6 inline-block text-primary hover:underline">প্রথম পাতায় ফিরুন</Link>
    </div>
  ),
  component: function SectionIndex() {
    const { section } = Route.useParams();
    const loaderData = Route.useLoaderData();
    const key = decodeURIComponent(section || "");
    const story = useSuspenseQuery(articleQuery(key));

    useEffect(() => {
      if (loaderData?.pageTitle) document.title = loaderData.pageTitle;
    }, [loaderData?.pageTitle]);

    if (story.data.article) {
      const article = story.data.article;
      const images = article.image_urls?.length ? article.image_urls : article.image_url ? [article.image_url] : [];
      return (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_1fr]">
            <article>
              <Link to="/$section" params={{ section: article.category_slug }} className="text-xs font-bold uppercase tracking-widest text-primary">
                {story.data.category?.name ?? categoryName(article.category_slug)}
              </Link>
              <h1 className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">{article.title}</h1>
              {article.excerpt ? <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p> : null}
              <p className="mt-4 border-y border-border py-2 text-sm text-muted-foreground">
                {article.author_name} · {formatBanglaDateTime(article.published_at)}
              </p>
              <div className="mt-6">
                <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} />
                {article.image_caption && article.content_type !== "video" ? (
                  <p className="mt-1 text-xs text-muted-foreground">{article.image_caption}</p>
                ) : null}
              </div>
              <div className="article-body mt-6">{renderArticleBody(article.body, images)}</div>
            </article>
            <aside>
              <h2 className="section-rule pb-1 font-serif text-lg font-bold">সম্পর্কিত খবর</h2>
              {story.data.related.map((a) => <ArticleCard key={a.id} article={a} variant="list" />)}
            </aside>
          </div>
        </div>
      );
    }

    const page = useSuspenseQuery(categoryQuery(key));
    const name = page.data.category?.name ?? categoryName(key);
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="section-rule mb-6 pb-1">
          <h1 className="font-serif text-3xl font-bold">{name}</h1>
        </div>
        {page.data.articles.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            এই বিভাগে এখনো কোনো খবর প্রকাশিত হয়নি।{" "}
            <Link to="/" className="text-primary hover:underline">প্রথম পাতায় ফিরুন</Link>
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {page.data.articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}
      </div>
    );
  },
});
