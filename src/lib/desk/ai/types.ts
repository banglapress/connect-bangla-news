export type ExtractedClaim = {
  text: string;
  type: "event" | "date" | "person" | "number" | "general";
};

export type SourcePacket = {
  sourceRowId: string;
  sourceId: string | null;
  sourceName: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  origin?: string | null;
  trusted?: boolean | null;
  domain?: string | null;
};

export type ClaimSupport = "multi_source" | "single_source" | "conflicting" | "unverified";

export type AttributedItem = {
  text: string;
  source_ids: string[];
  source_urls: string[];
  support: ClaimSupport;
};

export type TimelineItem = {
  time: string;
  text: string;
  source_ids: string[];
  source_urls: string[];
};

export type ConflictItem = {
  text: string;
  sides: { claim: string; source_ids: string[]; source_urls: string[] }[];
};

export type QuoteItem = {
  quote: string;
  speaker: string;
  source_ids: string[];
  source_urls: string[];
};

export type ResearchWarning = {
  code: "conflict" | "single_source" | "needs_verification" | "insufficient_sources" | "heuristic" | "missing_attribution" | "unsupported";
  message: string;
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

export type StructuredResearch = {
  summary: string;
  key_facts: AttributedItem[];
  timeline: TimelineItem[];
  people: AttributedItem[];
  organizations: AttributedItem[];
  locations: AttributedItem[];
  numbers: AttributedItem[];
  source_agreements: AttributedItem[];
  source_conflicts: ConflictItem[];
  unverified_claims: AttributedItem[];
  important_quotes: QuoteItem[];
  source_links: {
    title: string;
    url: string;
    name: string;
    published_at: string | null;
    origin: string;
    trusted: boolean;
  }[];
  warnings: ResearchWarning[];
  quality: "gemini" | "heuristic";
  provider: string;
  model: string | null;
  generatedAt: string;
  usage?: TokenUsage;
};

/** Legacy shape kept so existing admin UI and stored packets still render. */
export type ResearchPacket = {
  whatHappened: string;
  keyFacts: string[];
  dates: string[];
  people: string[];
  numbers: string[];
  conflicts: string[];
  needsVerification: string[];
  sourceLinks: { title: string; url: string; name: string }[];
  provider: string;
  generatedAt: string;
  model?: string | null;
  quality?: "gemini" | "heuristic";
  structured?: StructuredResearch;
  warnings?: ResearchWarning[];
};

export type ResearchInput = {
  title: string;
  excerpt?: string;
  sources: SourcePacket[];
  existingClaims?: { text: string; source_url?: string | null; claim_type?: string | null }[];
  existingFacts?: { text: string; status?: string | null }[];
};

export type ArticleStatus = "ready" | "needs_review" | "failed";

export type GeneratedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seo_title: string;
  meta_description: string;
  tags: string[];
  category: string;
  article_status: ArticleStatus;
  warnings: ResearchWarning[];
  provider: string;
  model: string | null;
  generatedAt: string;
  usage?: TokenUsage;
};

export type ArticleInput = {
  title: string;
  categorySlug?: string | null;
  research: StructuredResearch | ResearchPacket;
  sources: SourcePacket[];
};

export type EditorialValidation = {
  ok: boolean;
  article_status: ArticleStatus;
  warnings: ResearchWarning[];
};

export interface AIProvider {
  name: string;
  model?: string | null;
  isConfigured(): boolean;
  extractClaims(source: SourcePacket): Promise<ExtractedClaim[]>;
  summarizeTopic(sources: SourcePacket[]): Promise<string>;
  generateResearch(input: ResearchInput): Promise<StructuredResearch>;
  generateArticle(input: ArticleInput): Promise<GeneratedArticle>;
};
