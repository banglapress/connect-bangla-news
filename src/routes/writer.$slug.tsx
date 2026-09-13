import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getWriterPage } from "@/lib/writer.functions";
import { articlePath } from "@/lib/ids";
import { formatBanglaDate } from "@/lib/bangla";

const writerQuery = (slug: string) =>
  queryOptions({
    queryKey: ["writer", slug],
    queryFn: () => getWriterPage({ data: { slug } }),
  });

export const Route = createFileRoute("/writer/$slug")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(writerQuery(params.slug)),
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { title: `${loaderData?.writer?.name ?? "লেখক"} — The Connect` },
    ],
  }),
  component: function WriterPage() {
    const { slug } = Route.useParams();
    const { data } = useSuspenseQuery(writerQuery(slug));
    const writer = data.writer;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex gap-5 border-b border-border pb-6">
          {writer.photo_url ? (
            <img src={writer.photo_url} alt={writer.name} className="h-24 w-24 object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center bg-secondary font-serif text-3xl">{writer.name.slice(0, 1)}</div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">লেখক</p>
            <h1 className="mt-1 font-serif text-3xl font-bold">{writer.name}</h1>
            {writer.bio ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{writer.bio}</p> : (
              <p className="mt-3 text-sm text-muted-foreground">The Connect-এ প্রকাশিত লেখক।</p>
            )}
          </div>
        </div>
        <h2 className="section-rule mt-8 pb-1 font-serif text-xl font-bold">প্রকাশিত লেখা</h2>
        {data.articles.length === 0 ? (
          <p className="py-8 text-muted-foreground">এই লেখকের কোনো লেখা এখনো প্রকাশিত নয়।</p>
        ) : (
          <div className="divide-y divide-border">
            {data.articles.map((article) => (
              <a key={article.id} href={articlePath(article)} className="block py-4 hover:text-primary">
                <h3 className="font-serif text-lg font-semibold">{article.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{formatBanglaDate(article.published_at)}</p>
                {article.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p> : null}
              </a>
            ))}
          </div>
        )}
        <Link to="/" className="mt-8 inline-block text-sm text-primary hover:underline">প্রথম পাতায় ফিরুন</Link>
      </div>
    );
  },
});
