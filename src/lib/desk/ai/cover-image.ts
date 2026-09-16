export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const COVER_PROMPT_VERSION = "cover-v1";

const RETIRED_IMAGE_MODELS = new Set(["gemini-2.0-flash-preview-image-generation"]);

function readGeminiKey() {
  if (typeof process === "undefined") return "";
  return String(process.env.GEMINI_API_KEY || "").trim();
}

export function readGeminiImageModel() {
  const raw =
    typeof process === "undefined"
      ? DEFAULT_GEMINI_IMAGE_MODEL
      : String(process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL).trim() ||
        DEFAULT_GEMINI_IMAGE_MODEL;
  const model = raw.replace(/^models\//, "");
  if (RETIRED_IMAGE_MODELS.has(model)) return DEFAULT_GEMINI_IMAGE_MODEL;
  return model;
}

export function geminiImageConfigured() {
  return Boolean(readGeminiKey());
}

function endpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

export type CoverArticleContext = {
  headline: string;
  excerpt?: string | null;
  body?: string | null;
  category?: string | null;
  tags?: string[] | null;
  facts?: string[] | null;
  places?: string[] | null;
  organisations?: string[] | null;
  entities?: string[] | null;
};

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim();
}

export function buildCoverPrompt(input: CoverArticleContext) {
  const facts = (input.facts || []).filter(Boolean).slice(0, 8).join("; ");
  const places = (input.places || []).filter(Boolean).slice(0, 6).join(", ");
  const orgs = (input.organisations || []).filter(Boolean).slice(0, 6).join(", ");
  const entities = (input.entities || []).filter(Boolean).slice(0, 8).join(", ");
  const tags = (input.tags || []).filter(Boolean).slice(0, 8).join(", ");
  return [
    "Create one editorial news cover photograph-illustration for a professional news website.",
    "Style: minimalist, clean, modern, visually intelligent, cinematic lighting, high production value.",
    "Communicate the CENTRAL VISUAL IDEA of the story through the scene itself.",
    "NO text, letters, numbers, captions, headlines, watermarks, logos, newspaper mastheads, fake documents with readable text, screenshots, collages, quote cards, or infographics.",
    "Do not invent a photograph of a real public figure as if it were documentary coverage of the event.",
    "Treat the result as an editorial visualization, not a fake wire photo.",
    "No gore, no gratuitous violence, no fabricated organisational logos.",
    "Leave a quiet, uncluttered lower-left area so a small brand mark can be overlaid later.",
    "Aspect: wide landscape 16:9 news cover.",
    `Headline (do not render this text in the image): ${clip(input.headline || "", 220)}`,
    input.category ? `Category: ${input.category}` : "",
    tags ? `Tags: ${tags}` : "",
    places ? `Places: ${places}` : "",
    orgs ? `Organisations: ${orgs}` : "",
    entities ? `Entities: ${entities}` : "",
    facts ? `Key facts: ${clip(facts, 900)}` : "",
    input.excerpt ? `Summary: ${clip(input.excerpt, 500)}` : "",
    input.body ? `Article context: ${clip(input.body, 1800)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type GeminiImageResult = {
  mime: string;
  base64: string;
  model: string;
  durationMs: number;
  textNote: string | null;
};

function classifyGeminiError(status: number, raw: string) {
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit/i.test(raw)) return "rate_limit";
  if (status === 401 || status === 403 || /API_KEY|PERMISSION/i.test(raw)) return "auth";
  if (status >= 500) return "provider";
  if (/timed out|AbortError/i.test(raw)) return "timeout";
  return "invalid_response";
}

export async function generateGeminiCoverImage(prompt: string, timeoutMs = 90000): Promise<GeminiImageResult> {
  const apiKey = readGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = readGeminiImageModel();
  const started = Date.now();
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(model), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    const durationMs = Date.now() - started;
    if (!res.ok) {
      const category = classifyGeminiError(res.status, raw);
      throw new Error(`Gemini image ${category}: HTTP ${res.status}: ${raw.slice(0, 280)}`);
    }
    const payload = JSON.parse(raw);
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    let mime = "image/png";
    let base64 = "";
    let textNote: string | null = null;
    for (const part of parts) {
      if (part?.text) textNote = String(part.text).slice(0, 400);
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        base64 = String(inline.data);
        mime = String(inline.mimeType || inline.mime_type || "image/png");
      }
    }
    if (!base64) throw new Error("Gemini image invalid_response: no image bytes returned");
    return { mime, base64, model, durationMs, textNote };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Gemini image timeout: request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
