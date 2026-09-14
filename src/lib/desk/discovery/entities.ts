import type { DiscoveryQuery } from "./types";

export type DiscoveryEntities = {
  people: string[];
  organizations: string[];
  locations: string[];
  institutions: string[];
  events: string[];
  phrases: string[];
  tokens: string[];
  aliases: string[];
  topic: string[];
};

type LexKind = keyof Pick<DiscoveryEntities, "people" | "organizations" | "locations" | "institutions" | "events">;

export type LexRow = { bn: string; en: string[]; kind: LexKind };

export const LEXICON: LexRow[] = [
  { bn: "জিন্নাহ", en: ["Jinnah", "Muhammad Ali Jinnah"], kind: "people" },
  { bn: "মুজিব", en: ["Sheikh Mujibur Rahman", "Mujib"], kind: "people" },
  { bn: "বঙ্গবন্ধু", en: ["Sheikh Mujibur Rahman", "Bangabandhu"], kind: "people" },
  { bn: "শেখ মুজিবুর রহমান", en: ["Sheikh Mujibur Rahman"], kind: "people" },
  { bn: "আবদুল মালেক", en: ["Abdul Malek", "Malek"], kind: "people" },
  { bn: "আব্দুল মালেক", en: ["Abdul Malek", "Malek"], kind: "people" },
  { bn: "মালেক", en: ["Malek"], kind: "people" },
  { bn: "ডাকসু", en: ["DUCSU"], kind: "organizations" },
  { bn: "বিএনপি", en: ["BNP"], kind: "organizations" },
  { bn: "আওয়ামী লীগ", en: ["Awami League"], kind: "organizations" },
  { bn: "আওয়ামী লীগ", en: ["Awami League"], kind: "organizations" },
  { bn: "ছাত্রদল", en: ["Chhatra Dal"], kind: "organizations" },
  { bn: "জামায়াত", en: ["Jamaat"], kind: "organizations" },
  { bn: "জামায়াত", en: ["Jamaat"], kind: "organizations" },
  { bn: "বাংলাদেশ ব্যাংক", en: ["Bangladesh Bank"], kind: "institutions" },
  { bn: "ঢাবি", en: ["Dhaka University", "DU"], kind: "institutions" },
  { bn: "ঢাকা বিশ্ববিদ্যালয়", en: ["Dhaka University"], kind: "institutions" },
  { bn: "ঢাকা বিশ্ববিদ্যালয়", en: ["Dhaka University"], kind: "institutions" },
  { bn: "নির্বাচন কমিশন", en: ["Election Commission"], kind: "institutions" },
  { bn: "হাইকোর্ট", en: ["High Court"], kind: "institutions" },
  { bn: "সুপ্রিম কোর্ট", en: ["Supreme Court"], kind: "institutions" },
  { bn: "সংসদ", en: ["Parliament"], kind: "institutions" },
  { bn: "বাসস", en: ["BSS"], kind: "organizations" },
  { bn: "সংগ্রহশালা", en: ["museum", "DUCSU museum"], kind: "events" },
  { bn: "জাদুঘর", en: ["museum"], kind: "events" },
  { bn: "হেজিং", en: ["hedging", "hedge"], kind: "events" },
  { bn: "ঢাকা", en: ["Dhaka"], kind: "locations" },
  { bn: "চট্টগ্রাম", en: ["Chattogram"], kind: "locations" },
  { bn: "রাজশাহী", en: ["Rajshahi"], kind: "locations" },
  { bn: "খুলনা", en: ["Khulna"], kind: "locations" },
  { bn: "সিলেট", en: ["Sylhet"], kind: "locations" },
  { bn: "রংপুর", en: ["Rangpur"], kind: "locations" },
  { bn: "বরিশাল", en: ["Barishal"], kind: "locations" },
  { bn: "গভর্নর", en: ["Governor"], kind: "people" },
];

export const EVENT_KEYWORDS = [
  "ছবি", "ছিঁড়", "ছিঁড়", "ছিড়ে", "ছিঁড়ে", "ফেল", "সংগ্রহশালা", "জাদুঘর",
  "প্রদর্শন", "অপসারণ", "বিতর্ক", "প্রতিবাদ", "নিন্দা", "ব্যবস্থা", "সংস্কার",
  "দাবি", "কর্তৃপক্ষ", "শিক্ষার্থী", "হেজিং", "চালু", "photo", "museum",
  "torn", "removed", "controversy", "hedging", "hedge",
];

export const DEVELOPMENT_MARKERS = [
  "ছিঁড়", "ছিড়", "ফেল", "ব্যবস্থা", "নিন্দা", "প্রতিবাদ", "সংস্কার",
  "দাবি", "অপসারণ", "প্রদর্শন", "কর্তৃপক্ষ", "বক্তব্য", "প্রশাসন",
  "প্রতিক্রিয়া", "প্রতিক্রিয়া", "জবাব", "নিষেধাজ্ঞা", "মামলা",
  "গ্রেফতার", "বৈঠক", "ঘোষণা", "নির্দেশ", "তদন্ত", "চালু",
];

const STOPWORDS = new Set([
  "আর", "আরো", "আরও", "কী", "কি", "কেন", "কোন", "কোনো", "যে", "এবং", "বা", "থেকে",
  "জন্য", "সাথে", "সঙ্গে", "করে", "করা", "হলো", "হল", "হবে", "হয়েছে", "হয়েছে",
  "নিয়ে", "নিয়ে", "মধ্যে", "পর", "আগে", "একটি", "এক", "এই", "সেই", "তার", "তাদের",
  "না", "নয়", "নয়", "যুক্ত", "বাদ", "গেল", "গেছে", "নতুন", "এখন", "আজ", "কাল",
  "যা", "তা", "ও", "এ", "ওই", "সে", "হয়", "হয়", "ছিল", "the", "a", "an", "in", "on",
  "of", "and", "or", "to", "for", "with", "from", "by", "at", "news", "খবর",
]);

const GENERIC_PLACE = new Set(["ঢাকা", "dhaka", "বাংলাদেশ", "bangladesh"]);

export function nfc(value: string) {
  return value.normalize("NFC");
}

export function normalizeMatch(value: string) {
  return nfc(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D`']/g, "")
    .replace(/[\u0964\u0965.,!?;:|()\[\]{}<>«»…—–\-/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripInflection(token: string) {
  const suffixes = ["ের", "তে", "কে", "রা", "গুলো", "গুলি", "টি", "টা", "য়ে", "য়ে"];
  for (const suffix of suffixes) {
    if (token.length - suffix.length >= 2 && token.endsWith(suffix)) return token.slice(0, -suffix.length);
  }
  if (token.length >= 4 && token.endsWith("র") && !token.endsWith("ের")) return token.slice(0, -1);
  return token;
}

export function tokenize(value: string): string[] {
  return normalizeMatch(value)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function contentTokens(value: string): string[] {
  return tokenize(value)
    .map(stripInflection)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = nfc(value).replace(/\s+/g, " ").trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

function hayHas(hay: string, term: string) {
  const needle = normalizeMatch(stripInflection(term));
  if (needle.length < 2) return false;
  return hay.includes(needle) || hay.includes(normalizeMatch(term));
}

export function aliasesFor(term: string): string[] {
  const rows = LEXICON.filter((row) => {
    if (normalizeMatch(row.bn) === normalizeMatch(term)) return true;
    return row.en.some((en) => normalizeMatch(en) === normalizeMatch(term));
  });
  if (!rows.length) return [term];
  return unique(rows.flatMap((row) => [row.bn, ...row.en]));
}

export function conceptGroups(terms: string[]): string[][] {
  const groups: string[][] = [];
  const used = new Set<string>();
  for (const term of unique(terms)) {
    const key = normalizeMatch(term);
    if (used.has(key)) continue;
    const group = unique([term, ...aliasesFor(term)]);
    for (const item of group) used.add(normalizeMatch(item));
    const already = groups.find((existing) =>
      existing.some((item) => group.some((alias) => normalizeMatch(item) === normalizeMatch(alias))),
    );
    if (already) {
      already.push(...group.filter((item) => !already.some((row) => normalizeMatch(row) === normalizeMatch(item))));
    } else {
      groups.push(group);
    }
  }
  return groups;
}

export function termMatchesHay(term: string, hay: string, hayTokens: Set<string>) {
  for (const variant of aliasesFor(term)) {
    const raw = normalizeMatch(variant);
    const base = normalizeMatch(stripInflection(variant));
    if (raw.length >= 2 && hay.includes(raw)) return true;
    if (base.length >= 2 && hay.includes(base)) return true;
    if (hayTokens.has(raw) || hayTokens.has(base)) return true;
    for (const token of hayTokens) {
      if (base.length >= 3 && (token.includes(base) || base.includes(token))) return true;
    }
  }
  return false;
}

function distinctivePhrases(title: string) {
  const tokens = contentTokens(title);
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
    if (i < tokens.length - 2) phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return phrases;
}

export function extractDiscoveryEntities(title: string, excerpt = ""): DiscoveryEntities {
  const source = nfc(`${title} ${excerpt}`.trim());
  const hay = normalizeMatch(source);
  const tokens = contentTokens(title);
  const people: string[] = [];
  const organizations: string[] = [];
  const locations: string[] = [];
  const institutions: string[] = [];
  const events: string[] = [];
  const aliases: string[] = [];
  const topic: string[] = [];

  for (const row of LEXICON) {
    if (!hayHas(hay, row.bn) && !row.en.some((en) => hayHas(hay, en))) continue;
    if (row.kind === "people") people.push(row.bn, ...row.en);
    if (row.kind === "organizations") organizations.push(row.bn, ...row.en);
    if (row.kind === "locations") locations.push(row.bn, ...row.en);
    if (row.kind === "institutions") institutions.push(row.bn, ...row.en);
    if (row.kind === "events") events.push(row.bn, ...row.en);
    aliases.push(row.bn, ...row.en);
  }

  if (hay.includes("ডাকসু")) {
    organizations.push("ডাকসু", "DUCSU");
    institutions.push("ঢাকা বিশ্ববিদ্যালয়", "Dhaka University", "ঢাবি");
    aliases.push("DUCSU", "Dhaka University", "DUCSU museum");
    topic.push("DUCSU museum", "ডাকসু সংগ্রহশালা");
  }
  if (hayHas(hay, "ছবি") || hayHas(hay, "photo") || hayHas(hay, "portrait")) {
    events.push("ছবি", "photo");
  }
  if (hay.includes("ছিঁ") || hay.includes("ছিড়") || hay.includes("torn")) {
    events.push("ছিঁড়ে ফেলা", "photo torn down");
    topic.push("Jinnah photo controversy", "photo torn down");
  }
  if (hay.includes("সংগ্রহশালা") || hay.includes("museum")) {
    events.push("ডাকসু সংগ্রহশালা", "DUCSU museum");
    topic.push("DUCSU museum");
  }
  if (hay.includes("হেজিং") || hay.includes("hedg")) {
    events.push("হেজিং সুবিধা", "hedging facility");
    topic.push("Bangladesh Bank hedging");
  }
  if (hay.includes("বাংলাদেশ ব্যাংক") || hay.includes("bangladesh bank")) {
    institutions.push("বাংলাদেশ ব্যাংক", "Bangladesh Bank");
  }

  const phrases = distinctivePhrases(title);
  if (tokens.includes("ডাকসু") && tokens.some((token) => token.startsWith("সংগ্রহশালা"))) {
    phrases.unshift("ডাকসু সংগ্রহশালা");
  }

  const distinctive = tokens.filter((token) => token.length >= 3 && !GENERIC_PLACE.has(token));
  if (!topic.length && phrases[0]) topic.push(phrases[0]);

  return {
    people: unique(people),
    organizations: unique(organizations),
    locations: unique(locations),
    institutions: unique(institutions),
    events: unique(events),
    phrases: unique(phrases).slice(0, 8),
    tokens: unique(distinctive.length ? distinctive : tokens),
    aliases: unique(aliases),
    topic: unique(topic),
  };
}

export function entityList(entities: DiscoveryEntities) {
  return unique([
    ...entities.people,
    ...entities.organizations,
    ...entities.institutions,
    ...entities.locations,
    ...entities.events,
    ...entities.phrases,
    ...entities.topic,
  ]);
}

export function queriesFromEntities(entities: DiscoveryEntities): DiscoveryQuery[] {
  const drafted: DiscoveryQuery[] = [];
  const push = (text: string, lang: DiscoveryQuery["lang"], kind: DiscoveryQuery["kind"]) => {
    const cleaned = nfc(text).replace(/\s+/g, " ").trim();
    if (!cleaned || drafted.some((row) => row.text === cleaned)) return;
    drafted.push({ text: cleaned, lang, kind });
  };

  const org = entities.organizations[0] || entities.institutions[0];
  const person = entities.people.find((row) => !/[A-Za-z]/.test(row)) || entities.people[0];
  const phrase = entities.phrases.find((row) => row.split(" ").length === 2) || entities.topic[0] || "";
  const event = entities.events.find((row) => !GENERIC_PLACE.has(normalizeMatch(row))) || entities.topic[0];

  if (phrase && person) push(`"${phrase}" ${person}`, "bn", "phrase");
  if (org && person && org !== person) push(`"${org}" ${person}`, "bn", "entity");
  if (event && person) push(`"${event}" ${person}`, "bn", "phrase");
  if (org && event && !person) push(`"${org}" ${event}`, "bn", "entity");

  const orgEn = entities.organizations.concat(entities.institutions, entities.aliases).find((row) => /[A-Za-z]/.test(row));
  const personEn = entities.people.find((row) => /[A-Za-z]/.test(row));
  const eventEn = entities.events.concat(entities.topic).find((row) => /[A-Za-z]/.test(row));
  if (orgEn && personEn) push(`"${orgEn}" ${personEn}`, "en", "translated");
  else if (orgEn && eventEn) push(`"${orgEn}" ${eventEn}`, "en", "translated");

  return drafted.slice(0, 4);
}
