import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getArticle } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { ArticleMedia } from "@/components/article-media";
import { categoryName } from "@/lib/categories";
import { formatBanglaDateTime } from "@/lib/bangla";
import { renderArticleBody } from "@/lib/body-render";

const articleQuery = (uid: string) =>
  queryOptions({
    queryKey: ["article", uid],
    queryFn: () => getArticle({ data: { slug: uid } }),
  });

export const Route = createFileRoute("/$section/$uid")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(articleQuery(params.uid));
    if (!data.article) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const a = loaderData?.article;
    if (!a) return { meta: [{ title: "খবরটি পাওয়া যায়নি — The Connect" }] };
    return { meta: [{ title: `${a.title} — The Connect` }, { name: "description", content: a.excerpt ?? a.title }] };
  },
  component: function ArticlePage() {
    const { uid } = Route.useParams();
    const { data } = useSuspenseQuery(articleQuery(uid));
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
  },
});
