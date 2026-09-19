import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";

export type DeskStoryRow = {
  id: string;
  title_hint: string | null;
  category_slug: string | null;
  editorial_type?: "news" | "explainer" | "feature" | null;
  article_id: string | null;
  status: string;
  source_count: number;
  warning: string | null;
  updated_at: string;
  created_at: string;
  sources?: { title: string | null; url: string; name?: string | null }[];
};

export const listDeskStories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    let storiesRes = await context.supabase
      .from("desk_stories")
      .select("id, title_hint, category_slug, editorial_type, status, article_id, source_count, warning, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(80);

    if (storiesRes.error && /column|schema cache|editorial_type/i.test(storiesRes.error.message)) {
      storiesRes = await context.supabase
        .from("desk_stories")
        .select("id, title_hint, category_slug, status, article_id, source_count, warning, updated_at, created_at")
        .order("updated_at", { ascending: false })
        .limit(80);
    }
    if (storiesRes.error) throw new Error(storiesRes.error.message);
    const stories = (storiesRes.data ?? []) as DeskStoryRow[];

    // The articles table is the source of truth for actual publication state.
    // Keep already-published articles from appearing as DRAFT in the AI Desk when
    // older desk_stories rows were never synchronized.
    const articleIds = stories.map((row) => row.article_id).filter((id): id is string => Boolean(id));
    const publishedArticleIds = new Set<string>();
    if (articleIds.length) {
      const articlesRes = await context.supabase
        .from("articles")
        .select("id, status")
        .in("id", articleIds);
      if (articlesRes.error) throw new Error(articlesRes.error.message);
      for (const article of articlesRes.data ?? []) {
        if (article.status === "published") publishedArticleIds.add(article.id);
      }
    }

    const syncedStories = stories.map((row) =>
      publishedArticleIds.has(row.article_id ?? "") ? { ...row, status: "published" } : row,
    );

    // Published articles are finished work. Keep them out of the active AI Desk
    // monitor so the queue stays focused on stories that still need action.
    const activeStories = syncedStories.filter((row) => row.status !== "published");
    const ids = activeStories.map((row) => row.id);
    if (!ids.length) return activeStories;
    const links = await context.supabase
      .from("desk_story_sources")
      .select("story_id, title, url, source_id")
      .in("story_id", ids);
    const byStory: Record<string, { title: string | null; url: string }[]> = {};
    for (const row of links.data ?? []) {
      (byStory[row.story_id] ??= []).push({ title: row.title, url: row.url });
    }
    return activeStories.map((row) => ({ ...row, sources: byStory[row.id] ?? [] }));
  });
