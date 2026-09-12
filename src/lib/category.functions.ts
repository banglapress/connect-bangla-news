import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORIES, type SiteCategory } from "@/lib/categories";

function normalize(rows: any[] | null): SiteCategory[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parent_id ?? null,
    show_in_nav: row.show_in_nav ?? true,
    nav_order: row.nav_order ?? row.sort_order ?? 0,
    sort_order: row.sort_order ?? row.nav_order ?? 0,
  }));
}

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return CATEGORIES;

  const supabase = createClient(url, key);
  const full = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, parent_id, show_in_nav, nav_order")
    .order("nav_order");
  if (!full.error) return normalize(full.data);

  const basic = await supabase.from("categories").select("id, name, slug, sort_order").order("sort_order");
  if (!basic.error && basic.data?.length) return normalize(basic.data);
  return CATEGORIES;
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("শুধু অ্যাডমিন ক্যাটেগরি বদলাতে পারেন");
}

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        slug: z.string().min(1),
        parent_id: z.string().uuid().nullable().optional(),
        show_in_nav: z.boolean().optional().default(true),
        nav_order: z.number().int().optional().default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as { supabase: any; userId: string });
    const payload = {
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      parent_id: data.parent_id || null,
      show_in_nav: data.show_in_nav ?? true,
      nav_order: data.nav_order ?? 0,
      sort_order: data.nav_order ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase.from("categories").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as { supabase: any; userId: string });
    const { error } = await context.supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
