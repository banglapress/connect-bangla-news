import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { articlePath } from "@/lib/ids";
import { categoryName } from "@/lib/categories";
import { formatBanglaDate } from "@/lib/bangla";
import { publicImageUrl } from "@/lib/image";
import { DEFAULT_GEMINI_MODEL, geminiProvider } from "@/lib/desk/ai/gemini";
import { clipText, parseCardTemplate, type CardRatio } from "@/lib/desk/card/template";
import { facebookPublicStatus, maskPageId, probeFacebookPage, publishPagePhoto, readFacebookSecrets } from "@/lib/desk/facebook";
import { facebookImageFromStory } from "@/lib/desk/cover-image.functions";

function siteOrigin() {
  if (typeof process === "undefined") return "";
  return String(
    process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      "",
  ).replace(/\/$/, "");
}
