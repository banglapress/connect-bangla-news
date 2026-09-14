import type {
  ArticleDepth,
  ArticleStatus,
  GeneratedArticle,
  ResearchPacket,
  ResearchWarning,
  SourcePacket,
  StructuredResearch,
} from "./types";
import type { SourceUtilization } from "./source-content";

export const DEPTH_TARGETS: Record<ArticleDepth, { min: number; max: number; label: string }> = {
  brief: { min: 350, max: 500, label: "Brief" },
  standard: { min: 600, max: 900, label: "Standard" },
  detailed: { min: 900, max: 1300, label: "Detailed" },
  comprehensive: { min: 1200, max: 1800, label: "Comprehensive" },
};

export function parseArticleDepth(value: unknown): ArticleDepth {
  if (value === "brief" || value === "detailed" || value === "comprehensive") return value;
  return "standard";
}

export function inferArticleDepth(input: { sourceCount: number; richSources: number }): ArticleDepth {
  if (input.sourceCount >= 3 && input.richSources >= 2) return "comprehensive";
  if (input.sourceCount >= 2 && input.richSources >= 1) return "standard";
  return "brief";
}

export function countWords(text: string) {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

function structuredOf(research: StructuredResearch | ResearchPacket): StructuredResearch | null {
  if ("key_facts" in research && Array.isArray((research as StructuredResearch).key_facts)) {
    return research as StructuredResearch;
  }
  return (research as ResearchPacket).structured || null;
}

function packetHay(research: StructuredResearch | ResearchPacket) {
  const structured = structuredOf(research);
  if (structured) {
    return [
      structured.summary,
      structured.executive_summary,
      structured.what_happened,
      ...(structured.detailed_facts || structured.key_facts).map((row) => row.text),
      ...structured.numbers.map((row) => row.text),
      ...structured.people.map((row) => row.text),
      ...structured.locations.map((row) => row.text),
      ...structured.organizations.map((row) => row.text),
      ...structured.important_quotes.map((row) => `${row.speaker} ${row.quote}`),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
  }
  const row = research as ResearchPacket;
  return [row.whatHappened, ...row.keyFacts, ...row.people, ...row.numbers].join("\n").toLowerCase();
}

export function articleQualityReport(input: {
  article: GeneratedArticle;
  research: StructuredResearch | ResearchPacket;
  sources: SourcePacket[];
  utilization: SourceUtilization[];
  depth: ArticleDepth;
}) {
  const warnings: ResearchWarning[] = [...(input.article.warnings || [])];
  const structured = structuredOf(input.research);
  const body = input.article.body || "";
  const word_count = countWords(body);
  const hay = packetHay(input.research);
  const uniqueFactCount = structured?.unique_details?.length || structured?.key_facts.filter((row) => row.support === "single_source").length || 0;
  const quoteCount = structured?.important_quotes.length || 0;
  const conflictCount = structured?.source_conflicts.length || 0;
  const singleCount = structured?.key_facts.filter((row) => row.support === "single_source").length || 0;
  const richSources = input.utilization.filter((row) => row.available_content_level !== "metadata_only").length;

  if (input.sources.length < 2) {
    warnings.push({ code: "insufficient_sources", message: "⚠ Insufficient source coverage" });
  }
  if (conflictCount) warnings.push({ code: "conflict", message: "⚠ Conflicting information in the research dossier" });
  if (singleCount) warnings.push({ code: "single_source", message: "⚠ Single-source claim present — not independently verified" });
  if (structured?.unverified_claims.length) warnings.push({ code: "needs_verification", message: "⚠ Needs verification" });
  if (!body || word_count < 80) warnings.push({ code: "unsupported", message: "⚠ Article body is too thin for publication" });
  if (richSources === 0) {
    warnings.push({
      code: "limited_content",
      message: "⚠ Only titles/snippets were available. Do not treat this as a full-source reading.",
    });
  }

  const sentences = body
    .split(/[\n\u0964.]+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 24);
  const seen = new Set<string>();
  let repeats = 0;
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) repeats += 1;
    seen.add(key);
  }
  if (repeats >= 2) warnings.push({ code: "repetition", message: "⚠ Repeated sentences detected" });

  const generic = [/এটি অত্যন্ত গুরুত্বপূর্ণ/, /বিশেষজ্ঞরা বলছেন যে বিষয়টি গুরুত্বপূর্ণ/, /পরিস্থিতি গভীরভাবে পর্যবেক্ষণ/];
  if (generic.some((pattern) => pattern.test(body))) {
    warnings.push({ code: "unsupported", message: "⚠ Generic filler phrasing detected" });
  }

  const numberHits = body.match(/[০-৯0-9][০-৯0-9,.]{1,}/g) || [];
  for (const num of numberHits.slice(0, 10)) {
    if (num.length < 2) continue;
    if (!hay.includes(num) && !hay.includes(num.replace(/,/g, ""))) {
      warnings.push({ code: "unsupported", message: `⚠ Number ${num} is not clearly present in the research dossier` });
      break;
    }
  }

  const unique = warnings.filter((row, index, list) => list.findIndex((item) => item.code === row.code && item.message === row.message) === index);
  let article_status: ArticleStatus = input.article.article_status || "ready";
  if (!body) article_status = "failed";
  else if (unique.some((row) => row.code === "conflict" || row.code === "insufficient_sources" || row.code === "needs_verification" || row.code === "limited_content")) {
    if (article_status === "ready") article_status = "needs_review";
  }
  if (unique.some((row) => row.code === "unsupported")) {
    if (article_status === "ready") article_status = "needs_review";
  }
  if (article_status === "failed" && word_count >= 120) article_status = "needs_review";

  return {
    article_status,
    warnings: unique,
    metrics: {
      source_count: input.sources.length,
      source_utilization_count: richSources,
      unique_fact_count: uniqueFactCount,
      quote_count: quoteCount,
      warning_count: unique.length,
      single_source_claim_count: singleCount,
      conflicting_claim_count: conflictCount,
      unsupported_claim_count: unique.filter((row) => row.code === "unsupported").length,
      article_word_count: word_count,
      article_depth: input.depth,
    },
  };
}

export function packDossierForPrompt(research: StructuredResearch | ResearchPacket, maxChars = 20000) {
  const structured = structuredOf(research);
  if (!structured) return { packed: JSON.stringify(research).slice(0, maxChars), truncated: JSON.stringify(research).length > maxChars };
  const ordered = {
    executive_summary: structured.executive_summary || structured.summary,
    what_happened: structured.what_happened || structured.summary,
    unique_details: structured.unique_details || [],
    key_facts: structured.key_facts,
    detailed_facts: structured.detailed_facts || structured.key_facts,
    important_quotes: structured.important_quotes,
    attributed_statements: structured.attributed_statements || [],
    timeline: structured.timeline,
    reactions: structured.reactions || [],
    numbers: structured.numbers,
    people: structured.people,
    organizations: structured.organizations,
    locations: structured.locations,
    background: structured.background || [],
    previous_developments: structured.previous_developments || [],
    consequences: structured.consequences || [],
    source_agreements: structured.source_agreements,
    source_conflicts: structured.source_conflicts,
    unverified_claims: structured.unverified_claims,
    missing_information: structured.missing_information || [],
    warnings: structured.warnings,
    source_utilization: structured.source_utilization || [],
    truncated: structured.truncated === true,
  };
  const packed = JSON.stringify(ordered);
  if (packed.length <= maxChars) return { packed, truncated: structured.truncated === true };
  return { packed: packed.slice(0, maxChars), truncated: true };
}
