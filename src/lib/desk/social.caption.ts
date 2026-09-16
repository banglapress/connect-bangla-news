import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { DEFAULT_GEMINI_MODEL, geminiProvider } from "@/lib/desk/ai/gemini";
import { articlePublicUrl, fallbackCaption, headlineOf, loadStoryBundle } from "@/lib/desk/social.functions";

export const generateDeskCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const { story, article } = await loadStoryBundle(context.supabase, data.id);
    const headline = headlineOf(story, article);
    const excerpt = String(article?.excerpt || story.draft_excerpt || "");
    const url = articlePublicUrl(article);
    const tags = Array.isArray(article?.tags) ? article.tags : Array.isArray(story.tags) ? story.tags : [];
    let caption = fallbackCaption({ headline, excerpt, url, tags });
    let provider = "heuristic";
    if (geminiProvider.isConfigured()) {
      try {
        const model = geminiProvider.model || DEFAULT_GEMINI_MODEL;
        const result = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": String(process.env.GEMINI_API_KEY || ""),
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: [
                        "Write a short Facebook caption in Bangladesh Bangla for The Connect.",
                        "Neutral, concise, no invented facts, no clickbait.",
                        "Do not copy the article. Include the article URL on its own line.",
                        "Optionally add up to 3 relevant hashtags from the tags.",
                        `Headline: ${headline}`,
                        excerpt ? `Excerpt: ${excerpt.slice(0, 400)}` : "",
                        `URL: ${url}`,
                        tags.length ? `Tags: ${tags.join(", ")}` : "",
                        'Return JSON {"caption":"..."} only.',
                      ].filter(Boolean).join("\n"),
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseJsonSchema: {
                  type: "object",
                  properties: { caption: { type: "string" } },
                  required: ["caption"],
                  additionalProperties: false,
                },
              },
            }),
          },
        );
        const raw = await result.text();
        if (result.ok) {
          const payload = JSON.parse(raw);
          const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
          const parsed = text ? JSON.parse(text) : null;
          if (parsed?.caption) {
            caption = String(parsed.caption).trim();
            if (url && !caption.includes(url)) caption = `${caption}\n\n${url}`;
            provider = "gemini";
          }
        }
      } catch {
        provider = "heuristic";
      }
    }
    const saved = await context.supabase.from("desk_stories").update({
      social_caption: caption,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true, caption, provider };
  });

export const saveDeskCaption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), caption: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    const saved = await context.supabase.from("desk_stories").update({
      social_caption: data.caption,
      updated_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (saved.error) throw new Error(saved.error.message);
    return { ok: true };
  });
