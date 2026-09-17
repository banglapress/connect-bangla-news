export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
export const COVER_PROMPT_VERSION = "cover-v3";

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

function stripScripts(value: string) {
  return value
    .replace(/[\u0980-\u09FF\u0900-\u097F\u0600-\u06FF]+/g, " ")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function softenHarmLanguage(value: string) {
  return value
    .replace(
      /\b(dead|death|died|dying|killed|carcass|corpse|body|bodies|blood|bloody|gore|wound|wounded|injury|injured|slaughter|violence|violent|netted corpse)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function visualHints(input: CoverArticleContext) {
  const places = (input.places || []).map((row) => stripScripts(String(row))).filter(Boolean).slice(0, 4);
  const orgs = (input.organisations || []).map((row) => stripScripts(String(row))).filter(Boolean).slice(0, 3);
  const tags = (input.tags || []).map((row) => stripScripts(String(row))).filter(Boolean).slice(0, 5);
  const entities = (input.entities || []).map((row) => stripScripts(String(row))).filter(Boolean).slice(0, 6);
  const category = stripScripts(String(input.category || "")).replace(/[-_]/g, " ");
  const headline = softenHarmLanguage(stripScripts(input.headline || ""));
  return { places, orgs, tags, entities, category, headline };
}

export function buildCoverPrompt(input: CoverArticleContext) {
  const hints = visualHints(input);
  const subject = [hints.headline, hints.category, ...hints.places, ...hints.entities, ...hints.tags]
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");
  return [
    "Create one wordless editorial news photograph for a serious newspaper website.",
    "Minimalist, clean, professional, one clear scene, natural light, no collage.",
    "Show the idea of the story through living subjects, place and atmosphere only.",
    "If the news involves death, injury, nets or harm, DO NOT show carcasses, wounds, blood, suffering or dead animals.",
    "Instead show a living healthy subject in its natural habitat, or a calm environmental scene that suggests the topic.",
    "Example: a living dolphin in coastal river water; distant boats; quiet shoreline. Never a dead dolphin.",
    "NO TEXT of any kind: no letters, numbers, captions, headlines, UI, watermarks, mastheads, newspapers, documents, screens, signboards with writing.",
    "NO Bangla, NO Hindi, NO Devanagari, NO Arabic, NO English words in the picture.",
    "NO logo, NO brand mark, NO fake newspaper nameplate, NO 'The Connect', NO corner badge.",
    "Do not invent a photograph of a real public figure.",
    "Do not fill the frame with a giant isolated object.",
    "Wide landscape 16:9.",
    subject
      ? `Visual subject hints (do not render these words): ${clip(subject, 320)}`
      : "Visual subject: contemporary civic or natural scene in Bangladesh, restrained and specific.",
  ].join("\n");
}

export function buildSafeCoverPrompt(input?: CoverArticleContext) {
  const hints = input
    ? visualHints(input)
    : { places: [] as string[], orgs: [] as string[], tags: [] as string[], entities: [] as string[], category: "", headline: "" };
  const place = hints.places[0] || hints.category || "a South Asian coastal landscape";
  return [
    "Wordless editorial photograph, 16:9, clean news cover.",
    `Quiet outdoor scene suggesting ${place}.`,
    "Living animals only if any animal appears. No carcass, no blood, no wounds, no suffering.",
    "No people faces close up, no text, no letters, no logo, no watermark, no newspaper, no signage with writing.",
    "Natural daylight, simple composition, uncluttered corners.",
  ].join(" ");
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
