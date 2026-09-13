import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticle, getCategoryPage } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { ArticleMedia } from "@/components/article-media";
import { categoryName } from "@/lib/categories";
import { formatBanglaDateTime } from "@/lib/bangla";
import { renderArticleBody } from "@/lib/body-render";
import { isArticlePathId } from "@/lib/ids";

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
    if (isArticlePathId(params.section)) {
      const data = await context.queryClient.ensureQueryData(articleQuery(params.section));
      if (!data.article) throw notFound();
      return data;
    }
    return context.queryClient.ensureQueryData(categoryQuery(params.section));
  },
  head: ({ params, loaderData }) => {
    const article = (loaderData as { article?: { title: string; excerpt: string | null } } | undefined)?.article;
    if (article) {
      return { meta: [{ title: `${article.title} — The Connect` }, { name: "description", content: article.excerpt ?? article.title }] };
    }
    const name = categoryName(params.section);
    return { meta: [{ title: `${name} — The Connect` }] };
  },
  component: function SectionIndex() {
    const { section } = Route.useParams();
    if (isArticlePathId(section)) {
      const { data } = useSuspenseQuery(articleQuery(section));
      const article = data.article!;
      const images = article.image_urls?.length ? article.image_urls : article.image_url ? [article.image_url] : [];
      return (
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid gap-10 md:grid-cols-[minmax(0,2fr)_1fr]">
            <article>
              <Link to="/$section" params={{ section: article.category_slug }} className="text-xs font-bold uppercase tracking-widest text-primary">
                {data.category?.name ?? categoryName(article.category_slug)}
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
              {data.related.map((a) => <ArticleCard key={a.id} article={a} variant="list" />)}
            </aside>
          </div>
        </div>
      );
    }

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
