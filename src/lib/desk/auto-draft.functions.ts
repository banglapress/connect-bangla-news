import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { runAutoDraftPipeline } from "@/lib/desk/auto-draft";

export const runDeskAutoDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    return runAutoDraftPipeline(context.supabase, { userId: context.userId, limit: 2 });
  });
