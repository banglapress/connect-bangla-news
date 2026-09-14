import type {
  AIProvider,
  ArticleInput,
  ExtractedClaim,
  GeneratedArticle,
  ResearchInput,
  SourcePacket,
  StructuredResearch,
} from "./types";

function splitClaims(text: string): string[] {
  return text
    .split(/[\u0964.!?\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 12 && part.length <= 240);
}

function classify(text: string): ExtractedClaim["type"] {
  if (/\d{1,2}[\/.-]\d{1,2}|\d{4}/.test(text)) return "date";
  if (/\d/.test(text) || /[\u09e6-\u09ef]/.test(text)) return "number";
  return "general";
}

function overlap(a: string, b: string) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tb = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!ta.size || !tb.length) return 0;
  const hit = tb.filter((w) => ta.has(w)).length;
  return hit / Math.max(ta.size, tb.length);
}

export const heuristicProvider: AIProvider = {
  name: "heuristic",
  model: null,
  isConfigured() {
    return true;
  },
  async extractClaims(source) {
    const parts = splitClaims([source.title, source.excerpt].filter(Boolean).join(". "));
    const seen = new Set<string>();
    const claims: ExtractedClaim[] = [];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ text: part, type: classify(part) });
    }
    if (!claims.length && source.title) claims.push({ text: source.title, type: "event" });
    return claims.slice(0, 8);
  },
  async summarizeTopic(sources) {
    const titles = sources.map((row) => row.title).filter(Boolean);
    return titles[0] || "Untitled story";
  },
  async generateResearch(input: ResearchInput): Promise<StructuredResearch> {
    const extracted: { source: SourcePacket; text: string; type: ExtractedClaim["type"] }[] = [];
    for (const source of input.sources) {
      const claims = await this.extractClaims(source);
      for (const claim of claims) extracted.push({ source, text: claim.text, type: claim.type });
    }
    const groups: { text: string; sources: SourcePacket[] }[] = [];
    for (const row of extracted) {
      const found = groups.find((group) => overlap(group.text, row.text) >= 0.45);
      if (found) {
        if (!found.sources.some((source) => source.url === row.source.url)) found.sources.push(row.source);
      } else {
        groups.push({ text: row.text, sources: [row.source] });
      }
    }
    const attributed = groups.map((group) => ({
      text: group.text,
      source_ids: group.sources.map((source) => source.sourceRowId),
      source_urls: group.sources.map((source) => source.url),
      support: (group.sources.length >= 2 ? "multi_source" : "single_source") as const,
    }));
    const warnings = [
      {
        code: "heuristic" as const,
        message: "⚠ Heuristic research — not Gemini quality. Configure GEMINI_API_KEY for AI research.",
      },
    ];
    if (input.sources.length < 2) {
      warnings.push({ code: "insufficient_sources", message: "⚠ Insufficient source coverage" });
    }
    return {
      summary: input.sources[0]?.title || input.title || "",
      key_facts: attributed.filter((row) => row.support === "multi_source"),
      timeline: [],
      people: [],
      organizations: [],
      locations: [],
      numbers: attributed.filter((row) => classify(row.text) === "number"),
      source_agreements: attributed.filter((row) => row.support === "multi_source"),
      source_conflicts: [],
      unverified_claims: attributed.filter((row) => row.support === "single_source"),
      important_quotes: [],
      source_links: input.sources.map((source) => ({
        title: source.title || source.url,
        url: source.url,
        name: source.sourceName,
        published_at: source.publishedAt,
        origin: source.origin || "unknown",
        trusted: source.trusted === true,
      })),
      warnings,
      quality: "heuristic",
      provider: "heuristic",
      model: null,
      generatedAt: new Date().toISOString(),
    };
  },
  async generateArticle(_input: ArticleInput): Promise<GeneratedArticle> {
    throw new Error("Heuristic provider cannot write an original article. Configure GEMINI_API_KEY.");
  },
};
