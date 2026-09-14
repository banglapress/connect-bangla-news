import { buildDiscoveryQueries } from "./query";
import { googleNewsProvider } from "./google-news";
import { gdeltProvider } from "./gdelt";
import { decorateHit, isMeaningfulHit } from "./score";
import { hostnameOf, TRUSTED_DISCOVERY_DOMAINS } from "./trusted";
import { canonicalizeUrl } from "@/lib/desk/url";
import type { DiscoveryDiagnostic, DiscoveryHit, DiscoverySearchResult } from "./types";

export type { DiscoveryDiagnostic, DiscoveryHit, DiscoveryQuery, DiscoverySearchResult, DiscoveryProvider } from "./types";
export { buildDiscoveryQueries } from "./query";
export { scoreDiscoveryHit } from "./score";
export { googleNewsProvider } from "./google-news";
export { gdeltProvider } from "./gdelt";

function titleKey(domain: string, title: string) {
  const normalized = title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${hostnameOf(domain)}::${normalized}`;
}

function dedupeHits(hits: DiscoveryHit[], knownUrls: string[]) {
  const known = new Set(knownUrls.map((url) => (canonicalizeUrl(url) || url).replace(/\/$/, "")));
  const byUrl = new Set<string>();
  const byTitle = new Set<string>();
  const out: DiscoveryHit[] = [];
  for (const hit of hits) {
    const url = (canonicalizeUrl(hit.url) || hit.url).replace(/\/$/, "");
    if (!url || known.has(url) || byUrl.has(url)) continue;
    const key = titleKey(hit.domain || url, hit.title);
    if (key.endsWith("::")) continue;
    if (byTitle.has(key)) continue;
    byUrl.add(url);
    byTitle.add(key);
    out.push({ ...hit, url });
  }
  return out;
}

export async function discoverRelatedCoverage(input: {
  title: string;
  excerpt?: string;
  knownUrls: string[];
}): Promise<DiscoverySearchResult & { queries: string[] }> {
  const built = buildDiscoveryQueries(input.title, input.excerpt || "");
  const context = {
    storyTitle: input.title,
    entities: built.entities,
    phrases: built.phrases,
    knownUrls: input.knownUrls,
    trustedDomains: [...TRUSTED_DISCOVERY_DOMAINS],
  };

  const primary = await googleNewsProvider.search(built.queries, context);
  const diagnostics: DiscoveryDiagnostic[] = [...primary.diagnostics];
  let provider = "google_news";
  let merged = primary.hits.map((hit) => decorateHit(hit, context));

  const meaningful = merged.filter(isMeaningfulHit);
  if (meaningful.length < 2) {
    const fallback = await gdeltProvider.search(built.queries, context);
    diagnostics.push(...fallback.diagnostics);
    merged = [...merged, ...fallback.hits.map((hit) => decorateHit(hit, context))];
    if (!meaningful.length && fallback.hits.length) provider = fallback.diagnostics.some((row) => row.error) ? "google_news+gdelt" : "gdelt";
    else provider = "google_news+gdelt";
  }

  const hits = dedupeHits(merged, input.knownUrls)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 16);

  return {
    hits,
    diagnostics,
    provider,
    queries: built.queries.map((row) => row.text),
  };
}
