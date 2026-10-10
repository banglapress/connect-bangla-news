import type { ArticleCard as ArticleCardType } from "@/lib/news.functions";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate, writerPath } from "@/lib/bangla";
import { ArticleMedia } from "@/components/article-media";
import { articlePath } from "@/lib/ids";

type Props = { article: ArticleCardType; variant?: "lead" | "wide" | "compact" | "list"; priority?: boolean };

export function ArticleCard({ article, variant = "wide", priority = false }: Props) {
  const href = articlePath(article);
  if (variant === "list") {
    return (
      <article className="group py-3.5 first:pt-1 last:pb-1">
        <a href={href} className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
          <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="112px" className="aspect-[4/3] overflow-hidden rounded-sm bg-secondary" />
          <div className="min-w-0">
            <span className="text-[0.68rem] font-bold text-primary">{categoryName(article.category_slug)}</span>
            <h3 className="mt-1 font-serif text-base font-semibold leading-snug transition-colors group-hover:text-primary md:text-[1.05rem]">{article.title}</h3>
            <p className="mt-1.5 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
          </div>
        </a>
      </article>
    );
  }
  if (variant === "lead") {
    return (
      <article className="group">
        <a href={href} className="block">
          <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="(max-width: 768px) 100vw, 760px" className="aspect-[16/9] overflow-hidden rounded-sm bg-secondary" />
          <div className="pt-4">
            <span className="text-xs font-bold text-primary">{categoryName(article.category_slug)}</span>
            <h2 className="mt-1.5 font-serif text-2xl font-bold leading-[1.28] transition-colors group-hover:text-primary sm:text-3xl md:text-[2.1rem]">{article.title}</h2>
            {article.excerpt ? <p className="mt-2 line-clamp-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">{article.excerpt}</p> : null}
          </div>
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          <a href={writerPath(article.author_name)} className="hover:text-primary hover:underline">{article.author_name}</a>
          {" "}· {formatBanglaDate(article.published_at)}
        </p>
      </article>
    );
  }
  if (variant === "compact") {
    return (
      <article className="group min-w-0">
        <a href={href} className="block">
          <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="(max-width: 640px) 100vw, 300px" className="aspect-[16/10] overflow-hidden rounded-sm bg-secondary" />
          <span className="mt-2 block text-[0.68rem] font-bold text-primary">{categoryName(article.category_slug)}</span>
          <h3 className="mt-1 font-serif text-base font-semibold leading-snug transition-colors group-hover:text-primary md:text-lg">{article.title}</h3>
        </a>
        <p className="mt-2 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
      </article>
    );
  }
  return (
    <article className="group min-w-0">
      <a href={href} className="block">
        <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} priority={priority} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px" className="aspect-[16/10] overflow-hidden rounded-sm bg-secondary" />
        <span className="mt-2 block text-[0.68rem] font-bold text-primary">{categoryName(article.category_slug)}</span>
        <h3 className="mt-1 font-serif text-lg font-semibold leading-snug transition-colors group-hover:text-primary">{article.title}</h3>
        {article.excerpt ? <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p> : null}
      </a>
      <p className="mt-2 text-xs text-muted-foreground">
        <a href={writerPath(article.author_name)} className="hover:text-primary hover:underline">{article.author_name}</a>
        {" "}· {formatBanglaDate(article.published_at)}
      </p>
    </article>
  );
}