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
};

export const listDeskStories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { data, error } = await context.supabase
      .from("desk_stories")
      .select("id, title_hint, category_slug, status, source_count, warning, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as DeskStoryRow[];
  });
