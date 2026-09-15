export type ExtractedClaim = {
  text: string;
  type: "event" | "date" | "person" | "number" | "general";
};

export type ContentLevel = "full" | "partial" | "metadata_only";
export type ArticleDepth = "brief" | "standard" | "detailed" | "comprehensive";

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
  rawText?: string | null;
  availableText?: string;
  contentLevel?: ContentLevel;
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
  code:
    | "conflict"
    | "single_source"
    | "needs_verification"
    | "insufficient_sources"
    | "heuristic"
    | "missing_attribution"
    | "unsupported"
    | "limited_content"
    | "repetition"
    | "truncated";
  message: string;
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

export type SourceUtilizationRow = {
  source_row_id: string;
  name: string;
  url: string;
  available_content_level: ContentLevel;
  chars: number;
  facts_extracted: number;
  unique_facts: number;
  quotes_extracted: number;
  context_extracted: number;
  source_used_in_article: boolean;
};

export type StructuredResearch = {
  summary: string;
  executive_summary?: string;
  what_happened?: string;
  key_facts: AttributedItem[];
  detailed_facts?: AttributedItem[];
  timeline: TimelineItem[];
  people: AttributedItem[];
  organizations: AttributedItem[];
  locations: AttributedItem[];
  numbers: AttributedItem[];
  source_agreements: AttributedItem[];
  source_conflicts: ConflictItem[];
  unverified_claims: AttributedItem[];
  important_quotes: QuoteItem[];
  attributed_statements?: QuoteItem[];
  reactions?: AttributedItem[];
  background?: AttributedItem[];
  previous_developments?: AttributedItem[];
  consequences?: AttributedItem[];
  unique_details?: AttributedItem[];
  missing_information?: AttributedItem[];
  source_links: {
    title: string;
    url: string;
    name: string;
    published_at: string | null;
    origin: string;
    trusted: boolean;
    content_level?: ContentLevel;
  }[];
  source_utilization?: SourceUtilizationRow[];
  source_notes?: unknown[];
  warnings: ResearchWarning[];
  quality: "gemini" | "heuristic";
  provider: string;
  model: string | null;
  generatedAt: string;
  usage?: TokenUsage;
  truncated?: boolean;
  version?: number;
  source_fingerprint?: string;
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
  sourceNotes?: string;
  truncated?: boolean;
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
  depth?: ArticleDepth;
  word_count?: number;
};

export type ArticleInput = {
  title: string;
  categorySlug?: string | null;
  research: StructuredResearch | ResearchPacket;
  sources: SourcePacket[];
  depth?: ArticleDepth;
};

export type QualityMetrics = {
  source_count: number;
  source_utilization_count: number;
  unique_fact_count: number;
  quote_count: number;
  warning_count: number;
  single_source_claim_count: number;
  conflicting_claim_count: number;
  unsupported_claim_count: number;
  article_word_count: number;
  article_depth: ArticleDepth;
  requested_depth?: ArticleDepth;
  target_word_count?: number;
  actual_word_count?: number;
  below_target?: boolean;
  quality_status?: ArticleStatus;
};

export type EditorialValidation = {
  ok: boolean;
  article_status: ArticleStatus;
  warnings: ResearchWarning[];
  metrics?: QualityMetrics;
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
