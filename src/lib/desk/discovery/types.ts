import type { DiscoveryEntities } from "./entities";

export type DiscoveryQuery = {
  text: string;
  lang: "bn" | "en";
  kind: "phrase" | "entity" | "translated";
};

export type DiscoveryHit = {
  title: string;
  url: string;
  domain: string;
  sourceName: string | null;
  publishedAt: string | null;
  snippet: string | null;
  relevance: number;
  provider: string;
  query: string;
};

export type DiscoveryDiagnostic = {
  label: string;
  query: string;
  requestUrl: string;
  provider: string;
  status: number | null;
  resultCount: number;
  durationMs: number;
  error: string | null;
  bodyPreview: string | null;
  rateLimited?: boolean;
};

export type DiscoverySearchResult = {
  hits: DiscoveryHit[];
  diagnostics: DiscoveryDiagnostic[];
  provider: string;
};

export type DiscoverySearchContext = {
  storyTitle: string;
  entities: string[];
  phrases: string[];
  knownUrls: string[];
  trustedDomains: string[];
  structured?: DiscoveryEntities;
};

export interface DiscoveryProvider {
  name: string;
  search(queries: DiscoveryQuery[], context: DiscoverySearchContext): Promise<DiscoverySearchResult>;
}

export type DiscoveryCandidateStatus = "new" | "added" | "ignored";
