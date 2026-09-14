export type DiscoveryHit = {
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  relevance: number;
  provider: string;
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
};

export type DiscoverySearchResult = {
  hits: DiscoveryHit[];
  diagnostics: DiscoveryDiagnostic[];
};
