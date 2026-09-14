import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";

export type DeskStoryRow = {
  id: string;
  title_hint: string | null;
  category_slug: string | null;
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
    const storiesRes = await context.supabase
      .from("desk_stories")
      .select("id, title_hint, category_slug, status, source_count, warning, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(80);
    if (storiesRes.error) throw new Error(storiesRes.error.message);
    const stories = (storiesRes.data ?? []) as DeskStoryRow[];
    const ids = stories.map((row) => row.id);
    if (!ids.length) return stories;
    const links = await context.supabase
      .from("desk_story_sources")
      .select("story_id, title, url, source_id")
      .in("story_id", ids);
    const byStory: Record<string, { title: string | null; url: string }[]> = {};
    for (const row of links.data ?? []) {
      (byStory[row.story_id] ??= []).push({ title: row.title, url: row.url });
    }
    return stories.map((row) => ({ ...row, sources: byStory[row.id] ?? [] }));
  });
