import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";

export type NewsSource = {
  id: string;
  name: string;
  homepage_url: string | null;
  rss_url: string | null;
  api_url: string | null;
  category_slug: string | null;
  active: boolean;
  trust_level: number;
  priority: number;
  notes: string | null;
  last_fetched_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
};

const sourceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  homepage_url: z.string().optional().nullable(),
  rss_url: z.string().optional().nullable(),
  api_url: z.string().optional().nullable(),
  category_slug: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  trust_level: z.number().int().min(1).max(5).optional().default(3),
  priority: z.number().int().optional().default(100),
  notes: z.string().optional().nullable(),
});

export const listNewsSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const full = await context.supabase
      .from("news_sources")
      .select("id, name, homepage_url, rss_url, api_url, category_slug, active, trust_level, priority, notes, last_fetched_at, last_success_at, last_error")
      .order("priority");
    if (!full.error) return (full.data ?? []) as NewsSource[];
    const basic = await context.supabase
      .from("news_sources")
      .select("id, name, homepage_url, rss_url, api_url, category_slug, active, trust_level, priority, notes")
      .order("priority");
    if (basic.error) throw new Error(basic.error.message);
    return (basic.data ?? []) as NewsSource[];
  });

export const saveNewsSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => sourceInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const payload = {
      name: data.name.trim(),
      homepage_url: data.homepage_url || null,
      rss_url: data.rss_url || null,
      api_url: data.api_url || null,
      category_slug: data.category_slug || null,
      active: data.active ?? true,
      trust_level: data.trust_level ?? 3,
      priority: data.priority ?? 100,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("news_sources").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase.from("news_sources").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const setNewsSourceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { error } = await context.supabase
      .from("news_sources")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNewsSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { error } = await context.supabase.from("news_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
