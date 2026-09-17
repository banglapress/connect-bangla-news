import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAutoDraftPipeline } from "@/lib/desk/auto-draft";

async function handle(request: Request) {
  const denied = await authenticateCronRequest(request);
  if (denied) {
    const fallback = String(process.env.DESK_CRON_SECRET || "").trim();
    const header = request.headers.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!fallback || token !== fallback) return denied;
  }
  const result = await runAutoDraftPipeline(supabaseAdmin, { limit: 6 });
  return Response.json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/desk-auto-draft")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
