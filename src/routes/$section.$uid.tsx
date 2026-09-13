import { createFileRoute, redirect } from "@tanstack/react-router";
import { getArticle } from "@/lib/news.functions";

export const Route = createFileRoute("/$section/$uid")({
  beforeLoad: async ({ params }) => {
    const data = await getArticle({ data: { slug: params.uid } });
    const id = data.article?.public_id || params.uid;
    throw redirect({ to: "/$section", params: { section: id } });
  },
});
