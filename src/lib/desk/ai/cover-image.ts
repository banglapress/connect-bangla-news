export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.6-flash";
export const DEFAULT_GEMINI_COVER_PROMPT_MODEL = "gemini-3.5-flash-lite";
export const COVER_PROMPT_VERSION = "cover-v4";

const RETIRED_IMAGE_MODELS = new Set(["gemini-2.0-flash-preview-image-generation"]);

function env(name: string) {
  if (typeof process === "undefined") return "";
  return String(process.env[name] || "").trim();
}

function readGeminiKey() {
  return env("GEMINI_API_KEY");
}

export function readGeminiImageModel() {
  const raw = env("GEMINI_IMAGE_MODEL") || DEFAULT_GEMINI_IMAGE_MODEL;
  const model = raw.replace(/^models\//, "");
  if (RETIRED_IMAGE_MODELS.has(model)) return DEFAULT_GEMINI_IMAGE_MODEL;
  return model;
}

function readGeminiTextModel() {
  const model = (env("GEMINI_MODEL") || DEFAULT_GEMINI_TEXT_MODEL).replace(/^models\//, "");
  return model;
}

function readGeminiCoverPromptModel() {
  const model = (env("GEMINI_COVER_PROMPT_MODEL") || DEFAULT_GEMINI_COVER_PROMPT_MODEL).replace(/^models\//, "");
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

function stripMarkdown(value: string) {
  return value
    .replace(/^```(?:text|prompt)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^Prompt:\s*/i, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function safePromptContext(input: CoverArticleContext) {
  const lines = [
    `Headline: ${clip(input.headline || "", 300)}`,
    `Excerpt: ${clip(input.excerpt || "", 900)}`,
    `Category: ${clip(input.category || "", 120)}`,
    `Tags: ${(input.tags || []).map(String).filter(Boolean).slice(0, 8).join(", ")}`,
    `Key facts: ${(input.facts || []).map(String).filter(Boolean).slice(0, 6).join(" | ")}`,
    `Places: ${(input.places || []).map(String).filter(Boolean).slice(0, 6).join(", ")}`,
    `Organisations: ${(input.organisations || []).map(String).filter(Boolean).slice(0, 5).join(", ")}`,
    `Entities: ${(input.entities || []).map(String).filter(Boolean).slice(0, 8).join(", ")}`,
    `Article body excerpt: ${clip(input.body || "", 4500)}`,
  ];
  return lines.filter((line) => /:\s*\S/.test(line)).join("\n");
}

export async function generateGeminiCoverPrompt(input: CoverArticleContext, timeoutMs = 30000) {
  const apiKey = readGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = readGeminiCoverPromptModel();
  const prompt = [
    "You are the visual editor of a serious Bangladesh digital news publication.",
    "Convert the supplied article context into ONE production-ready image-generation prompt for an article cover.",
    "Return ONLY the final image prompt in English. Do not add explanations, labels, bullets, quotation marks, or markdown.",
    "The image must be minimalist, meaningful, editorial, realistic or sophisticated editorial illustration, and built around ONE clear visual idea.",
    "Normally show the principal living subject, relevant location, object, infrastructure, environment, or calm aftermath/surroundings.",
    "When the story concerns death, injury, abuse, crime, disaster, animal mortality, conflict, or other harm, DO NOT depict bodies, wounds, blood, gore, suffering, torture, graphic injury, or a victim in distress. Instead visualize the subject while alive, the setting, the responsible object/infrastructure, environmental context, investigation clues, or a restrained non-graphic aftermath.",
    "Do not invent a photograph of a real public figure. Do not imitate or identify a politician, celebrity, victim, suspect, or private person unless the article context explicitly requires a generic non-identifiable representation.",
    "Do not create fake documents, fake screenshots, fake news pages, readable signs, or fabricated evidence.",
    "NO TEXT inside the image. NO letters, numbers, captions, headlines, logos, watermarks, brand marks, newspaper mastheads, interface elements, or signage with readable writing.",
    "Leave a clean lower-left area suitable for a small real website logo to be overlaid later by the application.",
    "The composition must work as a 16:9 horizontal website news cover and crop cleanly to a 4:5 social image without losing the main subject.",
    "Avoid generic stock-photo aesthetics, overcrowded collages, giant isolated objects, excessive cinematic effects, and meaningless decorative elements.",
    "Keep the prompt concrete enough for an image model to understand the exact subject, setting, camera viewpoint, composition, light, mood, and visual hierarchy.",
    "Write about 70-120 words.",
    "IMPORTANT: do not repeat sensitive harm words from the article in the final image prompt. Translate them into a safe visual concept.",
    "ARTICLE CONTEXT:",
    safePromptContext(input),
  ].join("\n\n");

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 600,
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    });

    let res: Response | null = null;
    let raw = "";
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      res = await fetch(endpoint(model), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
      });
      raw = await res.text();
      if (res.ok) break;
      const retryable = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
      if (!retryable || attempt === maxAttempts) {
        throw new Error("Gemini cover prompt HTTP " + res.status + ": " + raw.slice(0, 280));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
    if (!res?.ok) throw new Error("Gemini cover prompt HTTP " + (res?.status || 500) + ": " + raw.slice(0, 280));
    const payload = JSON.parse(raw);
    const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join(" ") || "";
    const cleaned = stripMarkdown(String(text));
    if (cleaned.length < 30) throw new Error("Gemini returned an unusably short cover prompt");
    console.info("[cover-prompt]", { model, durationMs: Date.now() - started, status: "ok" });
    return { prompt: cleaned.slice(0, 4000), model, durationMs: Date.now() - started };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("Gemini cover prompt timeout: request timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackContext(input: CoverArticleContext) {
  return [
    `Story subject: ${clip(input.headline || "", 300)}`,
    `Relevant place: ${(input.places || []).map(String).filter(Boolean).slice(0, 3).join(", ")}`,
    `Relevant entities: ${(input.entities || []).map(String).filter(Boolean).slice(0, 5).join(", ")}`,
    `Category: ${clip(input.category || "", 100)}`,
  ]
    .filter((line) => /:\s*\S/.test(line))
    .join("; ");
}

export function buildCoverPrompt(input: CoverArticleContext) {
  return [
    "Create one minimalist, wordless editorial news image for a serious Bangladesh digital newspaper website.",
    "Use one clear visual idea drawn from the story subject, relevant location, living subjects, objects, infrastructure, or environment.",
    "Keep the scene realistic, clean, restrained, meaningful, and uncluttered with natural or believable light.",
    "If the story involves harm or loss, show a safe non-graphic visual: the living subject, relevant setting, responsible object or infrastructure, investigation context, or calm surroundings. Never show a body, wound, blood, gore, or suffering.",
    "NO text, letters, numbers, captions, headlines, logos, watermarks, fake documents, fake screenshots, readable signs, or brand marks.",
    "Do not fabricate a recognizable real person's face as documentary evidence.",
    "Compose for 16:9 landscape and leave a little clean space in the lower-left for the real website logo to be added later.",
    fallbackContext(input),
    "Do not render the story context as words in the image.",
  ].join(" ");
}

export function buildSafeCoverPrompt(input?: CoverArticleContext) {
  if (!input) {
    return "Wordless minimalist editorial image, 16:9 landscape, clean contemporary Bangladesh setting, one clear subject, natural daylight, calm professional newspaper cover composition, no text, no letters, no logo, no watermark.";
  }
  const subject = [
    ...(input.entities || []).map(String),
    ...(input.tags || []).map(String),
    input.category || "",
  ]
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const place = (input.places || []).map(String).filter(Boolean).slice(0, 3).join(", ");
  return [
    "Wordless minimalist editorial image, 16:9 landscape.",
    `Show a living, calm visual treatment of ${subject || "the main subject of the story"}.`,
    place ? `Set it in or around ${place}.` : "Use a believable Bangladesh setting appropriate to the subject.",
    "Prefer a living subject, natural environment, relevant object, infrastructure or quiet surroundings.",
    "Natural daylight, one clear visual idea, restrained composition, professional newspaper cover aesthetic.",
    "No text, no letters, no logo, no watermark, no fake documents, no readable signs.",
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
  if (/safety|harm|violence|policy|blocked|flagged/i.test(raw)) return "safety";
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
      temperature: 0.45,
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K",
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
