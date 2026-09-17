import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAutoDraftPipeline } from "@/lib/desk/auto-draft";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function expectedSecrets() {
  return [
    process.env.CRON_SECRET,
    process.env.DESK_CRON_SECRET,
    process.env.LOVABLE_CRON_SECRET,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function authorized(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const provided = digest(token);
  return expectedSecrets().some((secret) => timingSafeEqual(provided, digest(secret)));
}

async function handle(request: Request) {
  if (!expectedSecrets().length) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runAutoDraftPipeline(supabaseAdmin, { limit: 4 });
    return Response.json({ ok: true, durationMs: Date.now() - started, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auto draft failed";
    console.error("[auto-draft-cron]", { durationMs: Date.now() - started, error: message });
    return Response.json({ ok: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const Route = createFileRoute("/api/desk-auto-draft")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
