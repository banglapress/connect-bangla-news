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
import { DEPTH_TARGETS, countWords, packDossierForPrompt, parseArticleDepth } from "./quality";

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

async function generateJson(prompt: string, schema: Record<string, unknown>, timeoutMs = 75000): Promise<GeminiCallResult> {
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
      throw new Error("Gemini request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function sourceBlock(sources: SourcePacket[]) {
  return sources
    .map((source, index) => {
      const text = source.availableText || source.excerpt || "";
      return [
        `[S${index + 1}] id=${source.sourceRowId}`,
        `publisher=${source.sourceName}`,
        `url=${source.url}`,
        `published=${source.publishedAt || "unknown"}`,
        `origin=${source.origin || "unknown"}`,
        `trusted=${source.trusted === true ? "true" : "false"}`,
        `content_level=${source.contentLevel || "metadata_only"}`,
        `title=${source.title || ""}`,
        text ? `available_text=${text.slice(0, 2500)}` : "available_text=",
      ].join("\n");
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
    content_level: source.contentLevel,
  }));
  const warnings = asArray(raw.warnings);
  if (input.truncated) {
    warnings.push({
      code: "truncated",
      message: "⚠ Source notes were truncated to fit the model context. Unique facts and quotes were kept first.",
    });
  }
  if (input.sources.every((source) => source.contentLevel === "metadata_only")) {
    warnings.push({
      code: "limited_content",
      message: "⚠ Only titles/snippets were available. Do not claim full articles were read.",
    });
  }
  return {
    summary: String(raw.summary || raw.what_happened || raw.executive_summary || "").trim(),
    executive_summary: String(raw.executive_summary || raw.summary || "").trim(),
    what_happened: String(raw.what_happened || raw.summary || "").trim(),
    key_facts: asArray(raw.key_facts),
    detailed_facts: asArray(raw.detailed_facts).length ? asArray(raw.detailed_facts) : asArray(raw.key_facts),
    timeline: asArray(raw.timeline),
    people: asArray(raw.people),
    organizations: asArray(raw.organizations),
    locations: asArray(raw.locations),
    numbers: asArray(raw.numbers),
    source_agreements: asArray(raw.source_agreements),
    source_conflicts: asArray(raw.source_conflicts),
    unverified_claims: asArray(raw.unverified_claims),
    important_quotes: asArray(raw.important_quotes),
    attributed_statements: asArray(raw.attributed_statements),
    reactions: asArray(raw.reactions),
    background: asArray(raw.background),
    previous_developments: asArray(raw.previous_developments),
    consequences: asArray(raw.consequences),
    unique_details: asArray(raw.unique_details),
    missing_information: asArray(raw.missing_information),
    source_links: sourceLinks,
    warnings,
    quality: "gemini",
    provider: "gemini",
    model: meta.model,
    generatedAt: new Date().toISOString(),
    usage: {
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      durationMs: meta.durationMs,
    },
    truncated: input.truncated === true,
    version: 2,
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
    const text = [source.title, source.availableText || source.excerpt].filter(Boolean).join(". ");
    const parts = text
      .split(/[\u0964.!?\n]+/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter((part) => part.length >= 12);
    return parts.slice(0, 12).map((part) => ({ text: part, type: "general" as const }));
  },
  async summarizeTopic(sources: SourcePacket[]) {
    return sources.map((row) => row.title).filter(Boolean)[0] || "";
  },
  async generateResearch(input: ResearchInput): Promise<StructuredResearch> {
    const prompt = [
      "You are a Bangladesh newsroom researcher for The Connect.",
      "Build one master research dossier from the selected sources.",
      "Use ONLY the supplied titles, feed text, snippets, times and URLs.",
      "Do not invent people, dates, numbers, quotes, reactions, background or consequences.",
      "If a section cannot be supported, return an empty array or empty string.",
      "Write notes in clear Bangladesh Bangla (bn-BD). No India-Bengali wording.",
      "content_level=full means long feed/stored text was available to the app, not that a paywalled webpage was scraped.",
      "content_level=partial means excerpt/snippet. content_level=metadata_only means title/URL only.",
      "Never claim the full publisher page was read unless available_text is substantial.",
      "multi_source means two listed sources report the same fact. It does NOT mean independently verified.",
      "If two outlets appear to repeat one original claim, prefer single_source or unverified rather than multi_source.",
      "Keep unique source details. Do not drop a relevant unique fact only because one outlet reported it.",
      "Attribute every item with source_ids (the id= values) and source_urls.",
      "Do not treat Google News as a publisher.",
      `Story title: ${input.title}`,
      input.existingClaims?.length ? `Existing claims:\n${input.existingClaims.map((row) => `- ${row.text}`).join("\n")}` : "",
      "SOURCE NOTES:",
      input.sourceNotes || sourceBlock(input.sources),
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await generateJson(prompt, RESEARCH_JSON_SCHEMA, 75000);
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
    const depth = parseArticleDepth(input.depth);
    const target = DEPTH_TARGETS[depth];
    const packed = packDossierForPrompt(input.research, 20000);
    const prompt = [
      "You are a newsroom writer for The Connect, not a summarizer.",
      "Write a completely original Bangla news article from the research dossier only.",
      "Style: বাংলাদেশের সংবাদভাষা. Short and medium sentences. Neutral. Factual. Restrained.",
      "No India-Bengali wording. No fabricated facts. No clickbait. No filler.",
      "Do not copy or line-by-line paraphrase any source.",
      "Synthesize. Attribute only where needed. Do not write 'Source A says / Source B says' in every paragraph.",
      "Answer only when source-supported: কী ঘটেছে, কখন, কোথায়, কারা জড়িত, কীভাবে, কেন গুরুত্বপূর্ণ, এর আগে কী হয়েছিল, কারা কী বলেছে, কী পরিবর্তন হলো.",
      "Do not invent implications or predictions.",
      "Do not repeat the lead. Do not add generic background. Do not fabricate quotes.",
      "Preserve quote meaning exactly and name the speaker. Do not merge speakers.",
      "If numbers, dates or names conflict, keep both sides and set article_status to needs_review.",
      "If source material is thin, write a shorter article. Never pad to hit a word count.",
      `Article depth mode: ${depth}. Target range ${target.min}-${target.max} words only if the dossier supports it.`,
      "Choose a structure that fits the story: breaking, developing, human-interest or explanatory.",
      "Separate paragraphs with a blank line.",
      `Preferred category slug: ${input.categorySlug || "national"}`,
      `Story title hint: ${input.title}`,
      packed.truncated ? "NOTE: dossier was truncated. Prefer unique facts, quotes, chronology." : "",
      "RESEARCH DOSSIER JSON:",
      packed.packed,
      "SOURCE LIST:",
      sourceBlock(input.sources),
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await generateJson(prompt, ARTICLE_JSON_SCHEMA, 75000);
    const raw = result.json || {};
    const title = String(raw.title || input.title || "").trim();
    const body = String(raw.body || "").trim();
    return {
      title,
      slug: slugifyBangla(title || "khobor"),
      excerpt: String(raw.excerpt || "").trim(),
      body,
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
      depth,
      word_count: countWords(body),
    };
  },
};
