import { isTrustedDiscoveryDomain } from "./trusted";
import type { DiscoveryHit } from "./types";

function nfc(value: string) {
  return value.normalize("NFC").toLowerCase();
}

function tokensOf(value: string) {
  return nfc(value)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hit = a.filter((token) => setB.has(token)).length;
  return hit / Math.max(a.length, b.length);
}

function recencyScore(publishedAt: string | null) {
  if (!publishedAt) return 0.2;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return 0.2;
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days <= 1) return 1;
  if (days <= 3) return 0.7;
  if (days <= 7) return 0.4;
  return 0.15;
}

export function scoreDiscoveryHit(input: {
  title: string;
  snippet?: string | null;
  url: string;
  domain: string;
  publishedAt: string | null;
  storyTitle: string;
  entities: string[];
  phrases: string[];
}): number {
  const titleTokens = tokensOf(input.title);
  const storyTokens = tokensOf(input.storyTitle);
  const snippetTokens = tokensOf(input.snippet || "");
  const hayTokens = [...titleTokens, ...snippetTokens];
  const hay = nfc(`${input.title} ${input.snippet || ""}`);

  const tokenScore = overlap(storyTokens, hayTokens);
  const entityList = input.entities.map(nfc).filter((row) => row.length >= 2);
  const entityHits = entityList.filter((entity) => hay.includes(entity)).length;
  const entityScore = entityList.length ? entityHits / entityList.length : 0;
  const phraseHit = input.phrases.some((phrase) => hay.includes(nfc(phrase))) ? 1 : 0;
  const recent = recencyScore(input.publishedAt);
  const trusted = isTrustedDiscoveryDomain(input.domain || input.url) ? 1 : 0;

  const raw =
    0.4 * tokenScore +
    0.25 * entityScore +
    0.15 * phraseHit +
    0.12 * recent +
    0.08 * trusted;

  return Math.max(0, Math.min(1, Number(raw.toFixed(3))));
}

export function decorateHit(
  hit: Omit<DiscoveryHit, "relevance"> & { relevance?: number },
  context: { storyTitle: string; entities: string[]; phrases: string[] },
): DiscoveryHit {
  const relevance = scoreDiscoveryHit({
    title: hit.title,
    snippet: hit.snippet,
    url: hit.url,
    domain: hit.domain,
    publishedAt: hit.publishedAt,
    storyTitle: context.storyTitle,
    entities: context.entities,
    phrases: context.phrases,
  });
  return { ...hit, relevance };
}

export function isMeaningfulHit(hit: DiscoveryHit) {
  if (hit.relevance >= 0.22) return true;
  return isTrustedDiscoveryDomain(hit.domain) && hit.relevance >= 0.16;
}
