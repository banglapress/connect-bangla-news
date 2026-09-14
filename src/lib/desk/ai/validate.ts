import type {
  ArticleStatus,
  EditorialValidation,
  GeneratedArticle,
  ResearchPacket,
  ResearchWarning,
  SourcePacket,
  StructuredResearch,
} from "./types";

function packetText(research: StructuredResearch | ResearchPacket) {
  if ("key_facts" in research && Array.isArray((research as StructuredResearch).key_facts)) {
    const row = research as StructuredResearch;
    return [
      row.summary,
      ...row.key_facts.map((item) => item.text),
      ...row.people.map((item) => item.text),
      ...row.organizations.map((item) => item.text),
      ...row.locations.map((item) => item.text),
      ...row.numbers.map((item) => item.text),
      ...row.unverified_claims.map((item) => item.text),
      ...row.important_quotes.map((item) => `${item.speaker} ${item.quote}`),
      ...row.source_links.map((item) => `${item.title} ${item.name}`),
    ].join("\n");
  }
  const row = research as ResearchPacket;
  return [row.whatHappened, ...row.keyFacts, ...row.people, ...row.numbers, ...row.needsVerification, ...row.conflicts].join("\n");
}

function structuredOf(research: StructuredResearch | ResearchPacket): StructuredResearch | null {
  if ("key_facts" in research && Array.isArray((research as StructuredResearch).key_facts)) return research as StructuredResearch;
  return (research as ResearchPacket).structured || null;
}

export function toLegacyPacket(research: StructuredResearch): ResearchPacket {
  return {
    whatHappened: research.summary,
    keyFacts: research.key_facts.filter((row) => row.support === "multi_source").map((row) => row.text),
    dates: research.timeline.map((row) => `${row.time} — ${row.text}`.trim()),
    people: research.people.map((row) => row.text),
    numbers: research.numbers.map((row) => row.text),
    conflicts: research.source_conflicts.map((row) => row.text),
    needsVerification: research.unverified_claims.map((row) => row.text),
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
}): EditorialValidation {
  const warnings: ResearchWarning[] = [...(input.article.warnings || [])];
  const structured = structuredOf(input.research);
  const hay = packetText(input.research).toLowerCase();
  const body = `${input.article.title}\n${input.article.excerpt}\n${input.article.body}`;

  if (input.sources.length < 2) {
    warnings.push({ code: "insufficient_sources", message: "⚠ Insufficient source coverage" });
  }
  if (structured?.source_conflicts.length) {
    warnings.push({ code: "conflict", message: "⚠ Conflicting information in the research packet" });
  }
  const single = structured?.key_facts.filter((row) => row.support === "single_source") ?? [];
  if (single.length) {
    warnings.push({ code: "single_source", message: "⚠ Single-source claim present — not automatically verified" });
  }
  if (structured?.unverified_claims.length) {
    warnings.push({ code: "needs_verification", message: "⚠ Needs verification" });
  }
  if (!input.article.body || input.article.body.length < 80) {
    warnings.push({ code: "unsupported", message: "⚠ Article body is too thin for publication" });
  }

  const sentences = body.split(/[\n\u0964.]+/).map((row) => row.trim()).filter((row) => row.length > 20);
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      warnings.push({ code: "unsupported", message: "⚠ Duplicate/repetitive sentence detected" });
      break;
    }
    seen.add(key);
  }

  const numberHits = body.match(/[০-৯0-9][০-৯0-9,.]{1,}/g) || [];
  for (const num of numberHits.slice(0, 8)) {
    if (num.length < 2) continue;
    if (!hay.includes(num) && !hay.includes(num.replace(/,/g, ""))) {
      warnings.push({ code: "unsupported", message: `⚠ Number ${num} is not clearly present in the research packet` });
      break;
    }
  }

  const unique = warnings.filter((row, index, list) => list.findIndex((item) => item.code === row.code && item.message === row.message) === index);
  let article_status: ArticleStatus = input.article.article_status || "ready";
  if (!input.article.body || unique.some((row) => row.code === "unsupported" && /too thin/i.test(row.message))) {
    article_status = article_status === "failed" ? "failed" : unique.some((row) => row.code === "unsupported") ? "needs_review" : article_status;
  }
  if (unique.some((row) => row.code === "conflict" || row.code === "insufficient_sources" || row.code === "needs_verification")) {
    if (article_status === "ready") article_status = "needs_review";
  }
  if (article_status === "failed" && input.article.body.length >= 120) article_status = "needs_review";

  return { ok: article_status !== "failed", article_status, warnings: unique };
}
