import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { uploadCardImage } from "@/lib/desk/social.functions";

export const proxyDeskImage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ url: z.string().url().max(800) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    if (!/^https?:\/\//i.test(data.url)) throw new Error("Only http(s) image URLs can be proxied");
    const res = await fetch(data.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Could not fetch featured image (${res.status})`);
    const mime = String(res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) throw new Error("Featured image is not a usable photo");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > 8_000_000) throw new Error("Featured image is too large for a card");
    const safeMime = mime === "image/jpg" ? "image/jpeg" : mime;
    return { dataUrl: `data:${safeMime};base64,${buffer.toString("base64")}` };
  });

export const saveDeskCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        dataUrl: z.string().min(32),
        ratio: z.enum(["1:1", "4:5"]),
        headline: z.string().optional(),
        support: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const url = await uploadCardImage(context.supabase, data.id, data.dataUrl);
    const patch = {
      card_image_url: url,
      card_ratio: data.ratio,
      card_headline: data.headline || null,
      card_support: data.support || null,
      card_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const saved = await context.supabase.from("desk_stories").update(patch).eq("id", data.id);
    if (saved.error && /column|schema cache|card_/i.test(saved.error.message)) {
      const fallback = await context.supabase
        .from("desk_stories")
        .update({
          card_image_url: url,
          card_headline: data.headline || null,
          card_support: data.support || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (fallback.error) throw new Error(fallback.error.message);
    } else if (saved.error) {
      throw new Error(saved.error.message);
    }
    await context.supabase.from("desk_jobs").insert({
      story_id: data.id,
      stage: "card",
      status: "ok",
      payload: { ratio: data.ratio },
      finished_at: new Date().toISOString(),
    });
    return { ok: true, url };
  });
