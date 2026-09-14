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
};

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
};

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  extractClaims(source: SourcePacket): Promise<ExtractedClaim[]>;
  summarizeTopic(sources: SourcePacket[]): Promise<string>;
}
