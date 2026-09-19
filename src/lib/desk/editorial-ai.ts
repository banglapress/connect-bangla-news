import { generateGeminiStructuredJson } from "@/lib/desk/ai/gemini";
import type { SourcePacket } from "@/lib/desk/ai";

type EditorialType = "explainer" | "feature";

function sourceBlock(sources: SourcePacket[]) {
  return sources.map((source, index) => [
    `[S${index + 1}] id=${source.sourceRowId}`,
    `publisher=${source.sourceName}`,
    `url=${source.url}`,
    `published=${source.publishedAt || "unknown"}`,
    `trusted=${source.trusted === true ? "true" : "false"}`,
    `content_level=${source.contentLevel || "metadata_only"}`,
    `title=${source.title || ""}`,
    `available_text=${(source.availableText || source.rawText || source.excerpt || "").slice(0, 4500)}`,
  ].join("\n")).join("\n\n");
}

function candidateBlock(candidates: any[]) {
  return candidates.slice(0, 16).map((row, index) => [
    `[C${index + 1}] provider=${row.provider || "discovery"}`,
    `domain=${row.domain || ""}`,
    `url=${row.url || ""}`,
    `title=${row.title || ""}`,
    `published=${row.published_at || row.publishedAt || "unknown"}`,
    `relevance=${row.relevance ?? "unknown"}`,
    `snippet=${row.snippet || row.excerpt || ""}`,
  ].join("\n")).join("\n\n");
}

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    central_question: { type: "string" },
    why_it_matters: { type: "string" },
    angle_options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          question: { type: "string" },
          thesis: { type: "string" },
          coverage_plan: { type: "array", items: { type: "string" } },
          source_ids: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "question", "thesis", "coverage_plan", "source_ids", "source_urls"],
        additionalProperties: false,
      },
    },
    key_facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
          support: { type: "string", enum: ["multi_source", "single_source", "unverified"] },
        },
        required: ["text", "source_ids", "source_urls", "support"],
        additionalProperties: false,
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          sides: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["text", "sides", "source_urls"],
        additionalProperties: false,
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string" },
          text: { type: "string" },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["time", "text", "source_urls"],
        additionalProperties: false,
      },
    },
    research_gaps: { type: "array", items: { type: "string" } },
    recommended_sources: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "central_question",
    "why_it_matters",
    "angle_options",
    "key_facts",
    "contradictions",
    "timeline",
    "research_gaps",
    "recommended_sources",
    "warnings",
  ],
  additionalProperties: false,
};

const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    headline_direction: { type: "string" },
    hook: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          purpose: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          source_urls: { type: "array", items: { type: "string" } },
        },
        required: ["title", "purpose", "key_points", "source_urls"],
        additionalProperties: false,
      },
    },
    ending: { type: "string" },
    fact_check_notes: { type: "array", items: { type: "string" } },
  },
  required: ["headline_direction", "hook", "sections", "ending", "fact_check_notes"],
  additionalProperties: false,
};

export async function generateEditorialBrief(input: {
  title: string;
  editorialType: EditorialType;
  sources: SourcePacket[];
  candidates?: any[];
}) {
  const typeLabel = input.editorialType === "explainer" ? "explainer" : "feature";
  const prompt = [
    "You are a senior Bangladesh digital newsroom researcher.",
    `Prepare a multi-angle research brief for a Bengali ${typeLabel}, not a straight news rewrite.`,
    "The goal is to help an editor choose a defensible story angle before writing.",
    "Use only the supplied source text, snippets, titles, dates and URLs.",
    "Do not invent facts, statistics, quotes, motives, background or causal claims.",
    "Treat discovery candidates as leads/snippets, not verified facts.",
    "Separate what is supported from what still needs research.",
    "Identify contradictions and source gaps instead of smoothing them over.",
    "Propose 3 to 5 genuinely different angles, not cosmetic rewordings of the same angle.",
    "Each angle must have a central question, a possible thesis, and a concrete coverage plan.",
    "For an explainer, prioritize causes, systems, definitions, chronology and consequences.",
    "For a feature, prioritize the human problem, scene possibilities, stakes, voices and the wider system behind the story. Do not invent a scene or person.",
    "Write in natural Bangladesh Bangla (bn-BD).",
    `Topic: ${input.title}`,
    "ATTACHED SOURCE MATERIAL:",
    sourceBlock(input.sources),
    input.candidates?.length ? "DISCOVERY CANDIDATES / LEADS:" : "",
    input.candidates?.length ? candidateBlock(input.candidates) : "",
  ].filter(Boolean).join("\n\n");

  const result = await generateGeminiStructuredJson(prompt, BRIEF_SCHEMA, {
    timeoutMs: 90000,
    maxOutputTokens: 12000,
    thinkingLevel: "medium",
  });

  return {
    ...result.json,
    provider: "gemini",
    model: result.model,
    generatedAt: new Date().toISOString(),
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
    },
  };
}

export async function generateEditorialOutline(input: {
  title: string;
  editorialType: EditorialType;
  brief: any;
  approvedAngle: any;
  sources: SourcePacket[];
}) {
  const typeLabel = input.editorialType === "explainer" ? "explainer" : "feature";
  const prompt = [
    "You are a senior Bangladesh digital newsroom editor.",
    `Build a publishable outline for a Bengali ${typeLabel} from the approved research angle.`,
    "Use only the supplied research brief and source material.",
    "The outline should reveal the story in layers rather than dump the conclusion immediately.",
    "Do not invent scenes, quotes, experts or facts.",
    "For an explainer, keep the approved central question as the spine and explain the causal chain clearly.",
    "For a feature, begin with a supported human situation or observable fact, then widen to the larger issue.",
    "Every section must have a concrete purpose and source references.",
    `Topic: ${input.title}`,
    `Approved angle: ${JSON.stringify(input.approvedAngle)}`,
    "RESEARCH BRIEF:",
    JSON.stringify(input.brief),
    "ATTACHED SOURCES:",
    sourceBlock(input.sources),
  ].join("\n\n");

  const result = await generateGeminiStructuredJson(prompt, OUTLINE_SCHEMA, {
    timeoutMs: 75000,
    maxOutputTokens: 9000,
    thinkingLevel: "medium",
  });

  return {
    ...result.json,
    provider: "gemini",
    model: result.model,
    generatedAt: new Date().toISOString(),
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
    },
  };
}
