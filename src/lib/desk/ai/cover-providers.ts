import { generateGeminiCoverImage, geminiImageConfigured, readGeminiImageModel } from "./cover-image";

export const CLOUDFLARE_FLUX_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const COVER_SOURCE_WIDTH = 1280;
export const COVER_SOURCE_HEIGHT = 720;

export type CoverImageProviderName = "cloudflare" | "gemini";

export type CoverImageBytes = {
  mime: string;
  base64: string;
  provider: CoverImageProviderName;
  model: string;
  durationMs: number;
  textNote: string | null;
};

function env(name: string) {
  if (typeof process === "undefined") return "";
  return String(process.env[name] || "").trim();
}

export function readCoverImageProvider(): CoverImageProviderName {
  const raw = (env("COVER_IMAGE_PROVIDER") || env("GEMINI_IMAGE_PROVIDER") || "cloudflare").toLowerCase();
  if (raw === "gemini") return "gemini";
  return "cloudflare";
}

export function cloudflareCoverConfigured() {
  return Boolean(env("CLOUDFLARE_ACCOUNT_ID") && env("CLOUDFLARE_API_TOKEN"));
}

export function coverImageConfigured() {
  return readCoverImageProvider() === "gemini" ? geminiImageConfigured() : cloudflareCoverConfigured();
}

export function coverImageModelLabel() {
  return readCoverImageProvider() === "gemini"
    ? `Gemini · ${readGeminiImageModel()}`
    : "Cloudflare · FLUX.2 Klein 4B";
}

export function coverImageModelId() {
  return readCoverImageProvider() === "gemini" ? readGeminiImageModel() : CLOUDFLARE_FLUX_MODEL;
}

function classifyCloudflareError(status: number, raw: string) {
  if (status === 429 || /rate.?limit|quota/i.test(raw)) return "rate_limit";
  if (status === 401 || /invalid.+token|authentication/i.test(raw)) return "auth";
  if (status === 403 || /permission|not authorized|insufficient/i.test(raw)) return "permission";
  if (status === 404 || /model.+not found|unknown model/i.test(raw)) return "model_unavailable";
  if (status >= 500) return "provider";
  if (/timed out|AbortError/i.test(raw)) return "timeout";
  return "invalid_response";
}

function extractBase64Image(payload: any, rawText: string) {
  const candidates = [
    payload?.result?.image,
    payload?.result?.images?.[0],
    payload?.image,
    payload?.result,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 80) {
      return value.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    }
  }
  const match = rawText.match(/"image"\s*:\s*"([^"]+)"/);
  if (match?.[1] && match[1].length > 80) return match[1];
  return "";
}

export async function generateCloudflareCoverImage(prompt: string, timeoutMs = 90000): Promise<CoverImageBytes> {
  const accountId = env("CLOUDFLARE_ACCOUNT_ID");
  const token = env("CLOUDFLARE_API_TOKEN");
  if (!accountId || !token) throw new Error("Cloudflare cover credentials missing: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
  const started = Date.now();
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(COVER_SOURCE_WIDTH));
  form.append("height", String(COVER_SOURCE_HEIGHT));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLOUDFLARE_FLUX_MODEL}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("image/")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!res.ok || buffer.byteLength < 32) {
        throw new Error(`Cloudflare image ${classifyCloudflareError(res.status, "binary")} : HTTP ${res.status}`);
      }
      return {
        mime: contentType.split(";")[0] || "image/jpeg",
        base64: buffer.toString("base64"),
        provider: "cloudflare",
        model: CLOUDFLARE_FLUX_MODEL,
        durationMs: Date.now() - started,
        textNote: null,
      };
    }
    const raw = await res.text();
    if (!res.ok) {
      const category = classifyCloudflareError(res.status, raw);
      throw new Error(`Cloudflare image ${category}: HTTP ${res.status}: ${raw.slice(0, 280)}`);
    }
    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("Cloudflare image invalid_response: response was not JSON or image bytes");
    }
    if (payload?.success === false) {
      const message = JSON.stringify(payload?.errors || payload?.messages || payload).slice(0, 280);
      throw new Error(`Cloudflare image provider: ${message}`);
    }
    const base64 = extractBase64Image(payload, raw);
    if (!base64) throw new Error("Cloudflare image invalid_response: no image bytes returned");
    return {
      mime: "image/jpeg",
      base64,
      provider: "cloudflare",
      model: CLOUDFLARE_FLUX_MODEL,
      durationMs: Date.now() - started,
      textNote: null,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Cloudflare image timeout: request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateCoverImageBytes(prompt: string): Promise<CoverImageBytes> {
  const provider = readCoverImageProvider();
  if (provider === "gemini") {
    const image = await generateGeminiCoverImage(prompt);
    return {
      mime: image.mime,
      base64: image.base64,
      provider: "gemini",
      model: image.model,
      durationMs: image.durationMs,
      textNote: image.textNote,
    };
  }
  return generateCloudflareCoverImage(prompt);
}
