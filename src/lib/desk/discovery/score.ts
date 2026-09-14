import { isTrustedDiscoveryDomain } from "./trusted";
import { EVENT_KEYWORDS, contentTokens, entityList, normalizeMatch, stripInflection, type DiscoveryEntities } from "./entities";
import type { DiscoveryHit } from "./types";

export const DEFAULT_DISCOVERY_THRESHOLDS = {
  high: 0.7,
  relevant: 0.5,
  possible: 0.3,
  primaryLimit: 8,
};

export function relevanceBand(score: number, thresholds = DEFAULT_DISCOVERY_THRESHOLDS) {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.relevant) return "relevant";
  if (score >= thresholds.possible) return "possible";
  return "low";
}

function hayOf(title: string, snippet?: string | null) {
  return normalizeMatch(`${title} ${snippet || ""}`);
}

function matchRate(needles: string[], hay: string) {
  const terms = needles.map((row) => normalizeMatch(stripInflection(row))).filter((row) => row.length >= 2);
  if (!terms.length) return 0;
  const unique = [...new Set(terms)];
  const hits = unique.filter((term) => hay.includes(term)).length;
  return Math.min(1, hits / Math.min(unique.length, 3));
}

function phraseScore(phrases: string[], hay: string) {
  if (!phrases.length) return 0;
  const hits = phrases.filter((phrase) => hay.includes(normalizeMatch(phrase))).length;
  if (hits >= 1 && phrases.some((phrase) => phrase.split(" ").length >= 2 && hay.includes(normalizeMatch(phrase)))) return 1;
  return hits ? 0.55 : 0;
}

function eventScore(events: string[], hay: string) {
  const extra = EVENT_KEYWORDS.filter((word) => hay.includes(normalizeMatch(word)));
  const named = events.filter((event) => hay.includes(normalizeMatch(event)));
  if (named.length && extra.length) return 1;
  if (named.length || extra.length >= 2) return 0.75;
  if (extra.length) return 0.4;
  return 0;
}

function tokenRecall(storyTitle: string, hitTitle: string) {
  const story = contentTokens(storyTitle);
  const hit = new Set(contentTokens(hitTitle));
  if (!story.length || !hit.size) return 0;
  const matched = story.filter((token) => hit.has(token) || [...hit].some((row) => row.includes(token) || token.includes(row))).length;
  return matched / story.length;
}

function recencyScore(publishedAt: string | null) {
  if (!publishedAt) return 0.35;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return 0.35;
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days <= 1) return 1;
  if (days <= 3) return 0.8;
  if (days <= 7) return 0.55;
  return 0.2;
}

function coreSameEventBoost(entities: DiscoveryEntities, hay: string) {
  const cores = [
    ...entities.organizations,
    ...entities.people,
    ...entities.institutions.filter((row) => /ডাকসু|DUCSU|ঢাবি|বিশ্ববিদ্যাল/i.test(row)),
    ...entities.events.filter((row) => /সংগ্রহশালা|museum|ছবি|photo|ছিঁ/i.test(row)),
  ];
  const hits = [...new Set(cores.map((row) => normalizeMatch(stripInflection(row))).filter((row) => row.length >= 3))]
    .filter((term) => hay.includes(term));
  if (hits.length >= 3) return 0.88;
  if (hits.length >= 2) return 0.74;
  return 0;
}

export function scoreDiscoveryHit(input: {
  title: string;
  snippet?: string | null;
  url: string;
  domain: string;
  publishedAt: string | null;
  storyTitle: string;
  entities: DiscoveryEntities;
}): number {
  const hay = hayOf(input.title, input.snippet);
  const phrase = phraseScore(input.entities.phrases, hay);
  const people = matchRate(input.entities.people, hay);
  const orgs = matchRate([...input.entities.organizations, ...input.entities.institutions], hay);
  const places = matchRate(input.entities.locations, hay);
  const event = eventScore(input.entities.events, hay);
  const tokens = tokenRecall(input.storyTitle, input.title);
  const recent = recencyScore(input.publishedAt);
  const trusted = isTrustedDiscoveryDomain(input.domain || input.url) ? 1 : 0;

  const raw =
    0.2 * phrase +
    0.2 * people +
    0.16 * orgs +
    0.14 * event +
    0.12 * tokens +
    0.08 * recent +
    0.06 * places +
    0.04 * trusted;

  const floor = coreSameEventBoost(input.entities, hay);
  return Math.max(0, Math.min(1, Number(Math.max(raw, floor).toFixed(3))));
}

export function decorateHit(
  hit: Omit<DiscoveryHit, "relevance"> & { relevance?: number },
  context: { storyTitle: string; entities: DiscoveryEntities },
): DiscoveryHit {
  const relevance = scoreDiscoveryHit({
    title: hit.title,
    snippet: hit.snippet,
    url: hit.url,
    domain: hit.domain,
    publishedAt: hit.publishedAt,
    storyTitle: context.storyTitle,
    entities: context.entities,
  });
  return { ...hit, relevance };
}

export function isMeaningfulHit(hit: DiscoveryHit) {
  if (hit.relevance >= DEFAULT_DISCOVERY_THRESHOLDS.possible) return true;
  return isTrustedDiscoveryDomain(hit.domain) && hit.relevance >= 0.22;
}

export function titleSimilarity(a: string, b: string) {
  const ta = contentTokens(a);
  const tb = new Set(contentTokens(b));
  if (!ta.length || !tb.size) return 0;
  const hit = ta.filter((token) => tb.has(token)).length;
  return hit / Math.max(ta.length, tb.size);
}

export function developmentKey(title: string) {
  const hay = hayOf(title);
  const keys = ["ছিঁড়", "ছিড়", "ফেল", "ব্যবস্থা", "নিন্দা", "প্রতিবাদ", "সংস্কার", "দাবি", "অপসারণ", "প্রদর্শন", "কর্তৃপক্ষ", "বক্তব্য"];
  return keys.filter((key) => hay.includes(normalizeMatch(key))).join("|");
}

export function flattenEntities(entities: DiscoveryEntities) {
  return entityList(entities);
}
