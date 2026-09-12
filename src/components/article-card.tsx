import { Link } from "@tanstack/react-router";
import type { ArticleCard as ArticleCardType } from "@/lib/news.functions";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate } from "@/lib/bangla";
import { publicImageUrl } from "@/lib/image";

type Props = { article: ArticleCardType; variant?: "lead" | "wide" | "list" };

export function ArticleCard({ article, variant = "wide" }: Props) {
  const to = "/news/$slug" as const;
  const params = { slug: article.slug };

  if (variant === "list") {
    return (
      <article className="border-b border-border py-3">
        <Link to={to} params={params} className="group block">
          <h3 className="font-serif text-base font-semibold leading-snug group-hover:text-primary">
            {article.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatBanglaDate(article.published_at)}
          </p>
        </Link>
      </article>
    );
  }

  if (variant === "lead") {
    return (
      <article>
        <Link to={to} params={params} className="group block">
          {publicImageUrl(article.image_url) ? (
            <img
              src={publicImageUrl(article.image_url)!}
              alt={article.title}
              className="mb-4 aspect-[16/9] w-full object-cover"
              loading="eager"
            />
          ) : null}
          <span className="text-xs font-bold uppercase tracking-widest text-primary">
            {categoryName(article.category_slug)}
          </span>
          <h2 className="mt-2 font-serif text-3xl font-bold leading-tight group-hover:text-primary md:text-4xl">
            {article.title}
          </h2>
          {article.excerpt ? (
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
              {article.excerpt}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {article.author_name} · {formatBanglaDate(article.published_at)}
          </p>
        </Link>
      </article>
    );
  }

  return (
    <article className="border-b border-border pb-4">
      <Link to={to} params={params} className="group block">
        {publicImageUrl(article.image_url) ? (
          <img
            src={publicImageUrl(article.image_url)!}
            alt={article.title}
            className="mb-3 aspect-[16/10] w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <span className="text-[0.68rem] font-bold uppercase tracking-widest text-primary">
          {categoryName(article.category_slug)}
        </span>
        <h3 className="mt-1 font-serif text-lg font-semibold leading-snug group-hover:text-primary">
          {article.title}
        </h3>
        {article.excerpt ? (
          <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {formatBanglaDate(article.published_at)}
        </p>
      </Link>
    </article>
  );
}
