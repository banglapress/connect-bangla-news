import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { runAutoDraftPipeline } from "@/lib/desk/auto-draft";

export const runDeskAutoDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      limit: z.number().int().min(1).max(8).optional().default(4),
    }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    return runAutoDraftPipeline(context.supabase, {
      userId: context.userId,
      limit: data.limit,
    });
  });
