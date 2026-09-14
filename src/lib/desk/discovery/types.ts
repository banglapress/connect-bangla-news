export type DiscoveryHit = {
  title: string;
  url: string;
  domain: string;
  publishedAt: string | null;
  relevance: number;
  provider: string;
};

export interface DiscoveryProvider {
  name: string;
  searchRelated(input: { title: string; urls: string[] }): Promise<DiscoveryHit[]>;
}
