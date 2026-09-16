import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { publicImageUrl } from "@/lib/image";
import { DEFAULT_GEMINI_MODEL, geminiProvider } from "@/lib/desk/ai/gemini";
import { parseCardTemplate } from "@/lib/desk/card/template";
import { facebookPublicStatus, maskPageId, probeFacebookPage, publishPagePhoto, readFacebookSecrets } from "@/lib/desk/facebook";
import { facebookImageFromStory } from "@/lib/desk/cover-image.functions";
import { clipText } from "@/lib/desk/card/template";

function siteOrigin() {
  if (typeof process === "undefined") return "";
  return String(process.env.SITE_URL || process.env.PUBLIC_SITE_URL || process.env.VITE_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");
}

function articlePublicUrl(article: { public_id?: string | null; slug?: string | null } | null) {
  const origin = siteOrigin();
  const path = article?.public_id && article?.slug ? `/news/${article.slug}` : "/";
  return origin ? `${origin}${path}` : path;
}
