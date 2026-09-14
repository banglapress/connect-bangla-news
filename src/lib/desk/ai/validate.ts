import type {
  ArticleDepth,
  EditorialValidation,
  GeneratedArticle,
  ResearchPacket,
  ResearchWarning,
  SourcePacket,
  StructuredResearch,
} from "./types";
import { articleQualityReport } from "./quality";
import type { SourceUtilization } from "./source-content";

function structuredOf(research: StructuredResearch | ResearchPacket): StructuredResearch | null {
  if ("key_facts" in research && Array.isArray((research as StructuredResearch).key_facts)) {
    return research as StructuredResearch;
  }
  return (research as ResearchPacket).structured || null;
}

export function toLegacyPacket(research: StructuredResearch): ResearchPacket {
  const multi = research.key_facts.filter((row) => row.support === "multi_source").map((row) => row.text);
  const detailed = (research.detailed_facts || []).filter((row) => row.support === "multi_source").map((row) => row.text);
  return {
    whatHappened: research.what_happened || research.executive_summary || research.summary,
    keyFacts: [...new Set([...multi, ...detailed])].slice(0, 20),
    dates: research.timeline.map((row) => `${row.time} — ${row.text}`.trim()),
    people: research.people.map((row) => row.text),
    numbers: research.numbers.map((row) => row.text),
    conflicts: research.source_conflicts.map((row) => row.text),
    needsVerification: [
      ...research.unverified_claims.map((row) => row.text),
      ...research.key_facts.filter((row) => row.support === "single_source").map((row) => row.text),
    ].slice(0, 20),
    sourceLinks: research.source_links.map((row) => ({ title: row.title, url: row.url, name: row.name })),
    provider: research.provider,
    generatedAt: research.generatedAt,
    model: research.model,
    quality: research.quality,
    structured: research,
    warnings: research.warnings,
  };
}

export function validateGeneratedArticle(input: {
  article: GeneratedArticle;
  research: StructuredResearch | ResearchPacket;
  sources: SourcePacket[];
  utilization?: SourceUtilization[];
  depth?: ArticleDepth;
}): EditorialValidation {
  const structured = structuredOf(input.research);
  const utilization =
    input.utilization ||
    structured?.source_utilization ||
    input.sources.map((source) => ({
      source_row_id: source.sourceRowId,
      name: source.sourceName,
      url: source.url,
      available_content_level: source.contentLevel || "metadata_only",
      chars: (source.availableText || source.excerpt || "").length,
      facts_extracted: 0,
      unique_facts: 0,
      quotes_extracted: 0,
      context_extracted: 0,
      source_used_in_article: Boolean(source.availableText || source.excerpt),
    }));
  const report = articleQualityReport({
    article: input.article,
    research: input.research,
    sources: input.sources,
    utilization,
    depth: input.depth || input.article.depth || "standard",
  });
  return {
    ok: report.article_status !== "failed",
    article_status: report.article_status,
    warnings: report.warnings as ResearchWarning[],
    metrics: report.metrics,
  };
}
