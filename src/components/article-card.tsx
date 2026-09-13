import type { ArticleCard as ArticleCardType } from "@/lib/news.functions";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate } from "@/lib/bangla";
import { ArticleMedia } from "@/components/article-media";
import { articlePath } from "@/lib/ids";

type Props = { article: ArticleCardType; variant?: "lead" | "wide" | "list" };

export function ArticleCard({ article, variant = "wide" }: Props) {
  const href = articlePath(article);
  if (variant === "list") {
    return (
      <article className="border-b border-border py-3">
        <a href={href} className="group block">
          <h3 className="font-serif text-base font-semibold leading-snug group-hover:text-primary">{article.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
        </a>
      </article>
    );
  }
  if (variant === "lead") {
    return (
      <article>
        <a href={href} className="group block">
          <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} className="mb-4 aspect-[16/9]" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">{categoryName(article.category_slug)}</span>
          <h2 className="mt-2 font-serif text-3xl font-bold leading-tight group-hover:text-primary md:text-4xl">{article.title}</h2>
          {article.excerpt ? <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">{article.excerpt}</p> : null}
          <p className="mt-3 text-xs text-muted-foreground">{article.author_name} · {formatBanglaDate(article.published_at)}</p>
        </a>
      </article>
    );
  }
  return (
    <article className="border-b border-border pb-4">
      <a href={href} className="group block">
        <ArticleMedia contentType={article.content_type} youtubeUrl={article.youtube_url} imageUrl={article.image_url} title={article.title} className="mb-3 aspect-[16/10]" />
        <span className="text-[0.68rem] font-bold uppercase tracking-widest text-primary">{categoryName(article.category_slug)}</span>
        <h3 className="mt-1 font-serif text-lg font-semibold leading-snug group-hover:text-primary">{article.title}</h3>
        {article.excerpt ? <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
      </a>
    </article>
  );
}
