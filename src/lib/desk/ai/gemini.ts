import type {
  AIProvider,
  ArticleInput,
  ExtractedClaim,
  GeneratedArticle,
  ResearchInput,
  SourcePacket,
  StructuredResearch,
} from "./types";
import { ARTICLE_JSON_SCHEMA, RESEARCH_JSON_SCHEMA } from "./schemas";
import { slugifyBangla } from "@/lib/bangla";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const RETIRED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
]);

function readGeminiKey() {
  if (typeof process === "undefined") return "";
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function readGeminiModel() {
  const raw =
    typeof process === "undefined"
      ? DEFAULT_GEMINI_MODEL
      : String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const model = raw.replace(/^models\//, "");
  if (RETIRED_GEMINI_MODELS.has(model)) return DEFAULT_GEMINI_MODEL;
  return model;
}

function endpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

type GeminiCallResult = {
  json: any;
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  model: string;
};

async function generateJson(prompt: string, schema: Record<string, unknown>): Promise<GeminiCallResult> {
  const apiKey = readGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = readGeminiModel();
  const started = Date.now();
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
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
      throw new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 280)}`);
    }
    const payload = JSON.parse(raw);
    const text =
      payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") ||
      payload?.text ||
      "";
    if (!text.trim()) throw new Error("Gemini returned empty structured output");
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Gemini structured output was not valid JSON");
    }
    return {
      json,
      text,
      inputTokens: payload?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
      durationMs,
      model,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Gemini request timed out (45s)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sourceBlock(sources: SourcePacket[]) {
  return sources
    .map((source, index) => {
      const lines = [
        `[S${index + 1}] id=${source.sourceRowId}`,
        `publisher=${source.sourceName}`,
        `url=${source.url}`,
        `published=${source.publishedAt || "unknown"}`,
        `origin=${source.origin || "unknown"}`,
        `trusted=${source.trusted === true ? "true" : "false"}`,
        `title=${source.title || ""}`,
        `excerpt=${(source.excerpt || "").slice(0, 900)}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeResearch(raw: any, input: ResearchInput, meta: GeminiCallResult): StructuredResearch {
  const sourceLinks = input.sources.map((source) => ({
    title: source.title || source.url,
    url: source.url,
    name: source.sourceName,
    published_at: source.publishedAt,
    origin: source.origin || "unknown",
    trusted: source.trusted === true,
  }));
  return {
    summary: String(raw.summary || "").trim(),
    key_facts: asArray(raw.key_facts),
    timeline: asArray(raw.timeline),
    people: asArray(raw.people),
    organizations: asArray(raw.organizations),
    locations: asArray(raw.locations),
    numbers: asArray(raw.numbers),
    source_agreements: asArray(raw.source_agreements),
    source_conflicts: asArray(raw.source_conflicts),
    unverified_claims: asArray(raw.unverified_claims),
    important_quotes: asArray(raw.important_quotes),
    source_links: sourceLinks,
    warnings: asArray(raw.warnings),
    quality: "gemini",
    provider: "gemini",
    model: meta.model,
    generatedAt: new Date().toISOString(),
    usage: {
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      durationMs: meta.durationMs,
    },
  };
}

export const geminiProvider: AIProvider = {
  name: "gemini",
  get model() {
    return readGeminiModel();
  },
  isConfigured() {
    return Boolean(readGeminiKey());
  },
  async extractClaims(source: SourcePacket): Promise<ExtractedClaim[]> {
    const text = [source.title, source.excerpt].filter(Boolean).join(". ");
    const parts = text
      .split(/[\u0964.!?\n]+/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter((part) => part.length >= 12);
    return parts.slice(0, 8).map((part) => ({ text: part, type: "general" as const }));
  },
  async summarizeTopic(sources: SourcePacket[]) {
    return sources.map((row) => row.title).filter(Boolean)[0] || "";
  },
  async generateResearch(input: ResearchInput): Promise<StructuredResearch> {
    const prompt = [
      "You are a Bangladesh newsroom researcher for The Connect.",
      "Analyze ONLY the supplied source titles, excerpts, times and URLs.",
      "Write factual notes in clear Bangladesh Bangla (bn-BD). Do not use India-Bengali wording.",
      "Do not invent people, dates, numbers, quotes or events.",
      "If a field cannot be supported by the sources, leave it empty.",
      "\"Two sources agree\" means multi-source supported. It does NOT mean verified true.",
      "Use support=multi_source only when at least two listed sources report the same fact.",
      "Use support=single_source for claims that appear in only one source.",
      "Use support=conflicting when sources disagree.",
      "Use support=unverified when the claim is thin, second-hand, or needs a check.",
      "Attribute every item with source_ids (the id= values) and source_urls.",
      "Do not treat Google News as a publisher. Use the named publisher and original URL.",
      `Story title: ${input.title}`,
      input.excerpt ? `Story excerpt: ${input.excerpt.slice(0, 800)}` : "",
      input.existingClaims?.length
        ? `Existing claims:\n${input.existingClaims.map((row) => `- ${row.text}`).join("\n")}`
        : "",
      input.existingFacts?.length
        ? `Existing fact checks:\n${input.existingFacts.map((row) => `- ${row.status || "unknown"}: ${row.text}`).join("\n")}`
        : "",
      "SOURCES:",
      sourceBlock(input.sources),
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await generateJson(prompt, RESEARCH_JSON_SCHEMA);
    const research = normalizeResearch(result.json, input, result);
    if (input.sources.length < 2) {
      research.warnings.push({
        code: "insufficient_sources",
        message: "⚠ Insufficient source coverage — fewer than two sources on this story.",
      });
    }
    return research;
  },
  async generateArticle(input: ArticleInput): Promise<GeneratedArticle> {
    const researchJson = JSON.stringify(input.research).slice(0, 14000);
    const prompt = [
      "You are a Bangladesh news writer for The Connect.",
      "Write a completely original Bangla news article from the research packet only.",
      "Style: বাংলাদেশের সংবাদভাষা. Clear short sentences. Neutral. Factual.",
      "No India-Bengali wording. No fabricated facts. No exaggerated adjectives. No clickbait.",
      "Do not copy or line-by-line paraphrase any source article.",
      "Attribute statements to publishers where appropriate.",
      "Structure the body as: lead, main events, later developments, brief background, attributed quotes, closing.",
      "Separate paragraphs with a blank line.",
      "If facts conflict or important claims are single-source, set article_status to needs_review and add warnings.",
      "If sources are too thin to write a responsible article, set article_status to failed and keep body short.",
      `Preferred category slug: ${input.categorySlug || "national"}`,
      `Story title hint: ${input.title}`,
      "RESEARCH PACKET JSON:",
      researchJson,
      "SOURCE LIST:",
      sourceBlock(input.sources),
    ].join("\n\n");
    const result = await generateJson(prompt, ARTICLE_JSON_SCHEMA);
    const raw = result.json || {};
    const title = String(raw.title || input.title || "").trim();
    return {
      title,
      slug: slugifyBangla(title || "khobor"),
      excerpt: String(raw.excerpt || "").trim(),
      body: String(raw.body || "").trim(),
      seo_title: String(raw.seo_title || title).trim(),
      meta_description: String(raw.meta_description || raw.excerpt || "").trim(),
      tags: asArray<string>(raw.tags).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8),
      category: String(raw.category || input.categorySlug || "national").trim() || "national",
      article_status: raw.article_status === "failed" || raw.article_status === "needs_review" ? raw.article_status : "ready",
      warnings: asArray(raw.warnings),
      provider: "gemini",
      model: result.model,
      generatedAt: new Date().toISOString(),
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
      },
    };
  },
};
