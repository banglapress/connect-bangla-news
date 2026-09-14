import { isTrustedDiscoveryDomain } from "./trusted";
import {
  DEVELOPMENT_MARKERS,
  EVENT_KEYWORDS,
  conceptGroups,
  contentTokens,
  entityList,
  normalizeMatch,
  termMatchesHay,
  type DiscoveryEntities,
} from "./entities";
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

function hayTokenSet(title: string, snippet?: string | null) {
  return new Set(contentTokens(`${title} ${snippet || ""}`));
}

function conceptRate(terms: string[], hay: string, tokens: Set<string>) {
  const groups = conceptGroups(terms);
  if (!groups.length) return 0;
  const hits = groups.filter((group) => group.some((term) => termMatchesHay(term, hay, tokens))).length;
  return Math.min(1, hits / Math.min(groups.length, 2));
}

function phraseScore(phrases: string[], hay: string) {
  if (!phrases.length) return 0;
  const multi = phrases.filter((phrase) => phrase.trim().split(/\s+/).length >= 2);
  const exact = multi.filter((phrase) => hay.includes(normalizeMatch(phrase)));
  if (exact.length) return 1;
  const any = phrases.filter((phrase) => hay.includes(normalizeMatch(phrase)));
  return any.length ? 0.55 : 0;
}

function eventScore(events: string[], hay: string, tokens: Set<string>) {
  const named = events.filter((event) => termMatchesHay(event, hay, tokens));
  const extra = EVENT_KEYWORDS.filter((word) => hay.includes(normalizeMatch(word)));
  if (named.length && extra.length) return 1;
  if (named.length || extra.length >= 2) return 0.8;
  if (extra.length) return 0.45;
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

function coreConcepts(entities: DiscoveryEntities) {
  return conceptGroups([
    ...entities.people,
    ...entities.organizations,
    ...entities.institutions.filter((row) => !/^(ঢাকা|Dhaka)$/i.test(row)),
    ...entities.events.filter((row) => row.length >= 3),
    ...entities.topic,
    ...entities.phrases.slice(0, 2),
  ]);
}

function coreSameEventBoost(entities: DiscoveryEntities, hay: string, tokens: Set<string>, tokenOverlap: number) {
  const cores = coreConcepts(entities);
  const hits = cores.filter((group) => group.some((term) => termMatchesHay(term, hay, tokens)));
  const personHit = conceptGroups(entities.people).some((group) => group.some((term) => termMatchesHay(term, hay, tokens)));
  const orgHit = conceptGroups([...entities.organizations, ...entities.institutions]).some((group) =>
    group.some((term) => termMatchesHay(term, hay, tokens)),
  );
  const eventHit = eventScore(entities.events, hay, tokens) >= 0.8;
  const phraseHit = phraseScore(entities.phrases, hay) === 1;

  if (hits.length >= 3 || (personHit && orgHit && eventHit)) return 0.9;
  if ((personHit && (orgHit || eventHit || phraseHit)) || hits.length >= 2) return 0.82;
  if ((orgHit && eventHit) || (phraseHit && tokenOverlap >= 0.45)) return 0.74;
  if (tokenOverlap >= 0.6 && (personHit || orgHit)) return 0.7;
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
  const tokens = hayTokenSet(input.title, input.snippet);
  const phrase = phraseScore(input.entities.phrases, hay);
  const people = conceptRate(input.entities.people, hay, tokens);
  const orgs = conceptRate([...input.entities.organizations, ...input.entities.institutions], hay, tokens);
  const places = conceptRate(input.entities.locations, hay, tokens);
  const event = eventScore(input.entities.events, hay, tokens);
  const overlap = tokenRecall(input.storyTitle, input.title);
  const recent = recencyScore(input.publishedAt);
  const trusted = isTrustedDiscoveryDomain(input.domain || input.url) ? 1 : 0;

  const raw =
    0.22 * phrase +
    0.2 * people +
    0.16 * orgs +
    0.14 * event +
    0.12 * overlap +
    0.08 * recent +
    0.05 * places +
    0.03 * trusted;

  const floor = coreSameEventBoost(input.entities, hay, tokens, overlap);
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
  return DEVELOPMENT_MARKERS.filter((key) => hay.includes(normalizeMatch(key))).join("|");
}

export function flattenEntities(entities: DiscoveryEntities) {
  return entityList(entities);
}
