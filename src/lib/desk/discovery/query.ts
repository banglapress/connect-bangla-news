import { extractDiscoveryEntities, type DiscoveryEntities } from "./entities";
import type { DiscoveryQuery } from "./types";

const MAX_QUERIES = 4;

const STOPWORDS = new Set([
  "আর", "আরো", "আরও", "কী", "কি", "কেন", "কোন", "কোনো", "যে", "এবং", "বা", "থেকে",
  "জন্য", "সাথে", "সঙ্গে", "করে", "করা", "হলো", "হল", "হবে", "হয়েছে", "হয়েছে",
  "নিয়ে", "নিয়ে", "মধ্যে", "পর", "আগে", "একটি", "এক", "এই", "সেই", "তার", "তাদের",
  "না", "নয়", "নয়", "যুক্ত", "বাদ", "গেল", "গেছে", "নতুন", "কীভাবে", "কিভাবে",
  "এখন", "আজ", "কাল", "যা", "তা", "ও", "এ", "ওই", "সে", "হয়", "হয়", "ছিল",
  "the", "a", "an", "in", "on", "of", "and", "or", "to", "for", "with", "from",
  "by", "at", "is", "are", "was", "were", "be", "as", "after", "before", "over",
  "news", "খবর", "সত্য", "update", "live",
]);

const GENERIC_ONLY = new Set([
  "bangladesh", "বাংলাদেশ", "bengal", "bangla", "বাংলা", "dhaka", "ঢাকা", "news", "খবর",
]);

const ENGLISH_ALIASES: Record<string, string> = {
  ডাকসু: "DUCSU",
  "ডাকসু সংগ্রহশালা": "DUCSU museum",
  সংগ্রহশালা: "museum",
  জাদুঘর: "museum",
  জিন্নাহ: "Jinnah",
  "ঢাকা বিশ্ববিদ্যালয়": "Dhaka University",
  "ঢাকা বিশ্ববিদ্যালয়": "Dhaka University",
  বিশ্ববিদ্যালয়: "University",
  বিশ্ববিদ্যালয়: "University",
  ঢাবি: "Dhaka University",
  বিএনপি: "BNP",
  "আওয়ামী লীগ": "Awami League",
  "আওয়ামী লীগ": "Awami League",
  আওয়ামী: "Awami",
  আওয়ামী: "Awami",
  "নির্বাচন কমিশন": "Election Commission",
  সংসদ: "Parliament",
  প্রধানমন্ত্রী: "Prime Minister",
  রাষ্ট্রপতি: "President",
  হাইকোর্ট: "High Court",
  "সুপ্রিম কোর্ট": "Supreme Court",
  ঢাকা: "Dhaka",
  চট্টগ্রাম: "Chattogram",
  রাজশাহী: "Rajshahi",
  খুলনা: "Khulna",
  সিলেট: "Sylhet",
  রংপুর: "Rangpur",
  বরিশাল: "Barishal",
  মিয়ানমার: "Myanmar",
  মিয়ানমার: "Myanmar",
  রোহিঙ্গা: "Rohingya",
};

const IMPLIED_ENGLISH: Record<string, string[]> = {
  ডাকসু: ["DUCSU", "Dhaka University"],
  ঢাবি: ["Dhaka University"],
};

function nfc(value: string) {
  return value.normalize("NFC");
}

function stripPunctuation(value: string) {
  return value
    .replace(/[\u2018\u2019\u201C\u201D`']/g, " ")
    .replace(/[\u0964\u0965.,!?;:|()[\]{}<>«»…—–\-/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return stripPunctuation(nfc(value))
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stripInflection(token: string) {
  const suffixes = ["ের", "তে", "কে", "রা", "গুলো", "গুলি", "টি", "টা", "য়", "য়ে", "য়ে"];
  for (const suffix of suffixes) {
    if (token.length - suffix.length >= 2 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  if (token.length >= 4 && token.endsWith("র") && !token.endsWith("ের")) {
    return token.slice(0, -1);
  }
  return token;
}

function isStop(token: string) {
  return STOPWORDS.has(token) || STOPWORDS.has(token.toLowerCase());
}

function isBangla(token: string) {
  return /[\u0980-\u09FF]/.test(token);
}

function hasMatra(token: string) {
  return /[\u09BE-\u09CC\u09D7]/.test(token);
}

function looksGarbledToken(token: string, original: string) {
  if (!isBangla(token)) return false;
  if (token.length < 2) return true;
  if (original.includes(token)) return false;
  const grounded = tokenize(original).some((word) => {
    const base = stripInflection(word);
    return word.includes(token) || base.includes(token) || token.includes(base);
  });
  if (grounded) return false;
  if (token.length >= 3 && !hasMatra(token) && /[\u0985-\u09B9]{3,}/.test(token)) return true;
  return true;
}

function looksGarbledQuery(query: string, original: string) {
  const tokens = tokenize(query).filter((token) => !GENERIC_ONLY.has(token.toLowerCase()));
  if (!tokens.length) return true;
  const bangla = tokens.filter(isBangla);
  if (!bangla.length) return false;
  const bad = bangla.filter((token) => looksGarbledToken(token, original));
  return bad.length > Math.floor(bangla.length / 2);
}

function isGenericQuery(query: string) {
  const tokens = tokenize(query).map((token) => token.toLowerCase());
  if (!tokens.length) return true;
  return tokens.every((token) => GENERIC_ONLY.has(token) || isStop(token));
}

function contentTokens(title: string) {
  return tokenize(title)
    .map((token) => ({ raw: token, base: stripInflection(token) }))
    .filter((row) => row.base.length >= 2 && !isStop(row.raw) && !isStop(row.base));
}

function phrasesFrom(title: string) {
  const bases = tokenize(title)
    .map((token) => stripInflection(token))
    .filter((token) => token.length >= 2 && !isStop(token));
  const phrases: string[] = [];
  for (let i = 0; i < bases.length - 1; i += 1) {
    phrases.push(`${bases[i]} ${bases[i + 1]}`);
    if (i < bases.length - 2) phrases.push(`${bases[i]} ${bases[i + 1]} ${bases[i + 2]}`);
  }
  return phrases;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.normalize("NFC").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function englishVariants(terms: string[]) {
  const out: string[] = [];
  for (const term of terms) {
    if (ENGLISH_ALIASES[term]) out.push(ENGLISH_ALIASES[term]);
    if (IMPLIED_ENGLISH[term]) out.push(...IMPLIED_ENGLISH[term]);
    for (const [bn, en] of Object.entries(ENGLISH_ALIASES)) {
      if (term.includes(bn) && bn.length >= 3) out.push(en);
    }
  }
  return unique(out);
}

function quote(phrase: string) {
  return `"${phrase}"`;
}

export type QueryBuildResult = {
  queries: DiscoveryQuery[];
  entities: string[];
  structured: DiscoveryEntities;
  phrases: string[];
  tokens: string[];
};

export function buildDiscoveryQueries(title: string, excerpt = ""): QueryBuildResult {
  const headline = nfc(String(title || "").trim()) || nfc(String(excerpt || "").trim()).split(/[\n।.!?]/)[0] || "";
  const original = nfc(`${headline} ${excerpt || ""}`.trim());
  const items = contentTokens(headline || excerpt);
  const tokens = unique(items.map((row) => row.base));
  const phrases = unique(phrasesFrom(headline));
  const structured = extractDiscoveryEntities(headline, excerpt);
  const entities = unique([
    ...structured.people,
    ...structured.organizations,
    ...structured.institutions,
    ...phrases,
    ...tokens.filter((token) => token.length >= 3),
  ]).slice(0, 8);

  const primaryPhrase = phrases.find((row) => row.split(" ").length === 2) || phrases[0] || tokens.slice(0, 2).join(" ");
  const personOrEntity =
    tokens.find((token) => !primaryPhrase.split(" ").includes(token) && token.length >= 3) ||
    tokens[1] ||
    tokens[0];
  const shortOrg = tokens[0] || "";

  const drafted: DiscoveryQuery[] = [];
  const push = (text: string, lang: DiscoveryQuery["lang"], kind: DiscoveryQuery["kind"]) => {
    const cleaned = nfc(text).replace(/\s+/g, " ").trim();
    if (!cleaned || isGenericQuery(cleaned) || looksGarbledQuery(cleaned, original)) return;
    if (drafted.some((row) => row.text === cleaned)) return;
    drafted.push({ text: cleaned, lang, kind });
  };

  if (primaryPhrase && personOrEntity && primaryPhrase !== personOrEntity) {
    push(`${quote(primaryPhrase)} ${personOrEntity}`, "bn", "phrase");
  } else if (primaryPhrase) {
    push(quote(primaryPhrase), "bn", "phrase");
  }

  if (shortOrg && personOrEntity && shortOrg !== personOrEntity) {
    push(`${quote(shortOrg)} ${personOrEntity}`, "bn", "entity");
  }

  const english = englishVariants([primaryPhrase, shortOrg, personOrEntity, ...tokens].filter(Boolean));
  if (english.length >= 2) {
    push(`${quote(english[0])} ${english[1]}`, "en", "translated");
  } else if (english[0] && personOrEntity && ENGLISH_ALIASES[personOrEntity]) {
    push(`${quote(english[0])} ${ENGLISH_ALIASES[personOrEntity]}`, "en", "translated");
  } else if (english[0] && english[1]) {
    push(`${english[0]} ${english[1]}`, "en", "translated");
  }

  if (IMPLIED_ENGLISH[shortOrg]?.[1] && ENGLISH_ALIASES[personOrEntity]) {
    push(`${quote(IMPLIED_ENGLISH[shortOrg][1])} ${ENGLISH_ALIASES[personOrEntity]}`, "en", "translated");
  }

  if (!drafted.length) {
    const fallbackTokens = tokens.slice(0, 4);
    const fallback = fallbackTokens.join(" ");
    if (fallback && !isGenericQuery(fallback) && !looksGarbledQuery(fallback, original)) {
      push(fallback, "bn", "entity");
    } else if (headline.trim()) {
      const clipped = nfc(stripPunctuation(headline)).split(" ").slice(0, 6).join(" ");
      if (clipped && !looksGarbledQuery(clipped, original) && !isGenericQuery(clipped)) {
        push(clipped, "bn", "entity");
      }
    }
  }

  return {
    queries: drafted.slice(0, MAX_QUERIES),
    entities,
    structured,
    phrases,
    tokens,
  };
}

export function queryLooksSafe(query: string, title: string) {
  const original = nfc(title);
  return !isGenericQuery(query) && !looksGarbledQuery(query, original);
}
