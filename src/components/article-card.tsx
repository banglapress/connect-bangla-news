import type { ArticleCard as ArticleCardType } from "@/lib/news.functions";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate, writerPath } from "@/lib/bangla";
import { ArticleMedia } from "@/components/article-media";
import { articlePath } from "@/lib/ids";

type Props = { article: ArticleCardType; variant?: "lead" | "wide" | "list"; priority?: boolean };

export function ArticleCard({ article, variant = "wide", priority = false }: Props) {
  const href = articlePath(article);
  if (variant === "list") {
    return (
      <article className="group border-b border-border/80 py-3.5 transition-colors last:border-b-0 hover:border-primary/60">
        <a href={href} className="group block">
          <h3 className="font-serif text-base font-semibold leading-snug transition-colors group-hover:text-primary md:text-[1.05rem]">{article.title}</h3>
          <p className="mt-1.5 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
        </a>
      </article>
    );
  }
  if (variant === "lead") {
    return (
      <article className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
        <a href={href} className="block">
          <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="(max-width: 768px) 100vw, 800px" className="aspect-[16/9] overflow-hidden" />
          <div className="p-4 md:p-6">
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{categoryName(article.category_slug)}</span>
            <h2 className="mt-3 font-serif text-3xl font-bold leading-[1.2] transition-colors group-hover:text-primary md:text-4xl">{article.title}</h2>
            {article.excerpt ? <p className="mt-3 line-clamp-3 text-base leading-relaxed text-muted-foreground md:text-lg">{article.excerpt}</p> : null}
          </div>
        </a>
        <p className="mx-4 border-t border-border py-3 text-xs text-muted-foreground md:mx-6">
          <a href={writerPath(article.author_name)} className="font-medium hover:text-primary hover:underline">{article.author_name}</a>
          {" "}· {formatBanglaDate(article.published_at)}
        </p>
      </article>
    );
  }
  return (
    <article className="group h-full overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <a href={href} className="block">
        <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" className="aspect-[16/10] overflow-hidden" />
        <div className="p-4">
          <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-bold text-primary">{categoryName(article.category_slug)}</span>
          <h3 className="mt-2 font-serif text-lg font-semibold leading-snug transition-colors group-hover:text-primary">{article.title}</h3>
          {article.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p> : null}
        </div>
      </a>
      <p className="mx-4 border-t border-border py-3 text-xs text-muted-foreground">
        <a href={writerPath(article.author_name)} className="font-medium hover:text-primary hover:underline">{article.author_name}</a>
        {" "}· {formatBanglaDate(article.published_at)}
      </p>
    </article>
  );
}