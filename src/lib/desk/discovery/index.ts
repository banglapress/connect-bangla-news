import { buildDiscoveryQueries } from "./query";
import { googleNewsProvider } from "./google-news";
import { gdeltProvider } from "./gdelt";
import { decorateHit, developmentKey, isMeaningfulHit, titleSimilarity } from "./score";
import { hostnameOf, TRUSTED_DISCOVERY_DOMAINS } from "./trusted";
import { canonicalizeUrl } from "@/lib/desk/url";
import type { DiscoveryDiagnostic, DiscoveryHit, DiscoverySearchResult } from "./types";

export type { DiscoveryDiagnostic, DiscoveryHit, DiscoveryQuery, DiscoverySearchResult, DiscoveryProvider } from "./types";
export { buildDiscoveryQueries } from "./query";
export { scoreDiscoveryHit, DEFAULT_DISCOVERY_THRESHOLDS, relevanceBand } from "./score";
export { extractDiscoveryEntities } from "./entities";
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

function isExactOrRepublish(a: DiscoveryHit, b: DiscoveryHit) {
  const urlA = (canonicalizeUrl(a.url) || a.url).replace(/\/$/, "");
  const urlB = (canonicalizeUrl(b.url) || b.url).replace(/\/$/, "");
  if (urlA === urlB) return true;
  const sameDomain = hostnameOf(a.domain || a.url) === hostnameOf(b.domain || b.url);
  if (!sameDomain) return false;
  const similar = titleSimilarity(a.title, b.title);
  if (similar >= 0.92) return true;
  if (similar >= 0.78 && developmentKey(a.title) === developmentKey(b.title) && developmentKey(a.title)) return true;
  return false;
}

function dedupeHits(hits: DiscoveryHit[], knownUrls: string[]) {
  const known = new Set(knownUrls.map((url) => (canonicalizeUrl(url) || url).replace(/\/$/, "")));
  const out: DiscoveryHit[] = [];
  for (const hit of hits) {
    const url = (canonicalizeUrl(hit.url) || hit.url).replace(/\/$/, "");
    if (!url || known.has(url)) continue;
    const key = titleKey(hit.domain || url, hit.title);
    if (key.endsWith("::")) continue;
    const republish = out.some((existing) => isExactOrRepublish(existing, { ...hit, url }));
    if (republish) continue;
    out.push({ ...hit, url });
  }
  return out;
}

function diversify(hits: DiscoveryHit[]) {
  const ranked = [...hits].sort((a, b) => b.relevance - a.relevance);
  const primary: DiscoveryHit[] = [];
  const rest: DiscoveryHit[] = [];
  const seen = new Set<string>();
  for (const hit of ranked) {
    const domain = hostnameOf(hit.domain || hit.url);
    if (primary.length < 8 && (!seen.has(domain) || hit.relevance >= 0.82)) {
      primary.push(hit);
      seen.add(domain);
    } else {
      rest.push(hit);
    }
  }
  return [...primary, ...rest];
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
    structured: built.structured,
  };

  const primary = await googleNewsProvider.search(built.queries, context);
  const diagnostics: DiscoveryDiagnostic[] = [...primary.diagnostics];
  let provider = "google_news";
  let merged = primary.hits.map((hit) => decorateHit(hit, { storyTitle: input.title, entities: built.structured }));

  const meaningful = merged.filter(isMeaningfulHit);
  if (meaningful.length < 2) {
    const fallback = await gdeltProvider.search(built.queries, context);
    diagnostics.push(...fallback.diagnostics);
    merged = [...merged, ...fallback.hits.map((hit) => decorateHit(hit, { storyTitle: input.title, entities: built.structured }))];
    provider = "google_news+gdelt";
  }

  const hits = diversify(dedupeHits(merged, input.knownUrls)).slice(0, 20);

  return {
    hits,
    diagnostics,
    provider,
    queries: built.queries.map((row) => row.text),
  };
}
