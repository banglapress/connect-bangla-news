import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { searchArticles } from "@/lib/news.functions";
import { ArticleCard } from "@/components/article-card";
import { toBanglaDigits } from "@/lib/bangla";

const searchSchema = z.object({ q: z.string().optional().default("") });

const resultsQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => searchArticles({ data: { q } }),
  });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(resultsQuery(deps.q)),
  head: () => ({
    meta: [
      { title: "খোঁজ — The Connect" },
      { name: "description", content: "The Connect-এর প্রকাশিত খবরের ভেতর খুঁজে দেখুন।" },
      { property: "og:title", content: "খোঁজ — The Connect" },
      { property: "og:description", content: "প্রকাশিত খবরের ভেতর খুঁজে দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center text-muted-foreground">
      খোঁজার সময় সমস্যা হয়েছে। আবার চেষ্টা করুন।
    </div>
  ),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const { data } = useSuspenseQuery(resultsQuery(q));

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 md:py-10">
      <div className="mb-7 border-b-2 border-foreground pb-3">
        <h1 className="font-serif text-2xl font-bold md:text-3xl">
          {q ? `“${q}” — ${toBanglaDigits(data.length)}টি ফল` : "খোঁজ"}
        </h1>
      </div>
      {data.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {q ? "কোনো খবর পাওয়া যায়নি।" : "উপরের ঘরে লিখে খুঁজুন।"}
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
