import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";

export type DeskIngestSettings = {
  lookbackHours: number;
  maxItems: number;
};

const DEFAULTS: DeskIngestSettings = { lookbackHours: 12, maxItems: 20 };

export async function readIngestSettings(supabase: any): Promise<DeskIngestSettings> {
  const { data } = await supabase.from("desk_settings").select("key, value").in("key", ["ingest_lookback_hours", "ingest_max_items"]);
  const map = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
  const lookback = Number(map.get("ingest_lookback_hours") ?? DEFAULTS.lookbackHours);
  const maxItems = Number(map.get("ingest_max_items") ?? DEFAULTS.maxItems);
  return {
    lookbackHours: [6, 12, 24].includes(lookback) ? lookback : DEFAULTS.lookbackHours,
    maxItems: Math.min(50, Math.max(5, Number.isFinite(maxItems) ? maxItems : DEFAULTS.maxItems)),
  };
}

export const getDeskSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    return readIngestSettings(context.supabase);
  });

export const saveDeskSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      lookbackHours: z.number().int().refine((n) => [6, 12, 24].includes(n)),
      maxItems: z.number().int().min(5).max(50),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const rows = [
      { key: "ingest_lookback_hours", value: data.lookbackHours },
      { key: "ingest_max_items", value: data.maxItems },
    ];
    for (const row of rows) {
      const { error } = await context.supabase.from("desk_settings").upsert({
        key: row.key,
        value: row.value,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
