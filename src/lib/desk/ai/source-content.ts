export type ContentLevel = "full" | "partial" | "metadata_only";

export type SourceUtilization = {
  source_row_id: string;
  name: string;
  url: string;
  available_content_level: ContentLevel;
  chars: number;
  facts_extracted: number;
  unique_facts: number;
  quotes_extracted: number;
  context_extracted: number;
  source_used_in_article: boolean;
};

export type SourceNote = {
  source_row_id: string;
  source_name: string;
  url: string;
  published_at: string | null;
  origin: string;
  available_content_level: ContentLevel;
  original_title: string;
  main_event: string;
  detailed_facts: string[];
  unique_information: string[];
  quotes: { quote: string; speaker: string }[];
  numbers: string[];
  names: string[];
  organizations: string[];
  locations: string[];
  chronology: string[];
  reactions: string[];
  missing_information: string;
  available_text: string;
};

const PLACE_HINT = /ঢাকা|চট্টগ্রাম|রাজশাহী|খুলনা|সিলেট|বরিশাল|রংপুর|ময়মনসিংহ|বাংলাদেশ|গাজা|কাবুল|দিল্লি|লন্ডন|ওয়াশিংটন/;
const ORG_HINT = /ব্যাংক|মন্ত্রণালয়|বিশ্ববিদ্যালয়|কমিশন|পুলিশ|আদালত|সংসদ|সরকার|কমিটি|সংস্থা|ইউনিয়ন|লিমিটেড|বিবিসি|প্রথম আলো/;
const REACTION_HINT = /বলেন|জানান|মন্তব্য|প্রতিক্রিয়া|অভিযোগ|দাবি|নিন্দা|সমর্থন/;
const TIME_HINT = /আজ|গতকাল|গত|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার|\d{1,2}\s?(জানু|ফেব্রু|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্ট|অক্টো|নভে|ডিসে)|২০\d{2}/;

export function classifyContentLevel(text: string): ContentLevel {
  const chars = text.replace(/\s+/g, " ").trim().length;
  if (chars >= 1500) return "full";
  if (chars >= 220) return "partial";
  return "metadata_only";
}

export function availableSourceText(row: {
  title?: string | null;
  excerpt?: string | null;
  raw_text?: string | null;
}) {
  const raw = String(row.raw_text || "").trim();
  const excerpt = String(row.excerpt || "").trim();
  const title = String(row.title || "").trim();
  const longest = [raw, excerpt].sort((a, b) => b.length - a.length)[0] || "";
  return [title, longest].filter(Boolean).join("\n");
}

function sentences(text: string) {
  return text
    .split(/[\u0964.!?|\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 18 && part.length <= 360);
}

function extractQuotes(text: string) {
  const found: { quote: string; speaker: string }[] = [];
  const patterns = [/"([^"]{12,240})"/g, /‘([^’]{12,240})’/g, /“([^”]{12,240})”/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const quote = match[1].replace(/\s+/g, " ").trim();
      const before = text.slice(Math.max(0, match.index - 80), match.index);
      const speakerMatch = before.match(/([^\n,]{3,40})\s+(বলেন|জানান|বলেছেন|মন্তব্য করেন)\s*$/);
      found.push({ quote, speaker: speakerMatch?.[1]?.trim() || "" });
      if (found.length >= 8) return found;
    }
  }
  return found;
}

function extractNumbers(text: string) {
  const hits = text.match(/[০-৯0-9][০-৯0-9,%./-]{1,12}/g) || [];
  return [...new Set(hits.filter((row) => row.length >= 2))].slice(0, 12);
}

export function overlapScore(a: string, b: string) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const tb = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!ta.size || !tb.length) return 0;
  return tb.filter((w) => ta.has(w)).length / Math.max(ta.size, tb.length);
}

export function extractSourceNote(input: {
  source_row_id: string;
  source_name: string;
  url: string;
  published_at: string | null;
  origin?: string | null;
  title: string;
  excerpt?: string | null;
  raw_text?: string | null;
}): SourceNote {
  const available_text = availableSourceText(input);
  const level = classifyContentLevel(available_text);
  const parts = sentences(available_text);
  const quotes = extractQuotes(available_text);
  const numbers = extractNumbers(available_text);
  const names = parts
    .flatMap((row) => row.split(/[,\s]+/))
    .filter((token) => token.length >= 3 && /[অ-হA-Z]/.test(token) && !ORG_HINT.test(token))
    .slice(0, 8);
  const organizations = parts.filter((row) => ORG_HINT.test(row)).slice(0, 6);
  const locations = parts.filter((row) => PLACE_HINT.test(row)).slice(0, 6);
  const chronology = parts.filter((row) => TIME_HINT.test(row)).slice(0, 8);
  const reactions = parts.filter((row) => REACTION_HINT.test(row)).slice(0, 6);
  return {
    source_row_id: input.source_row_id,
    source_name: input.source_name,
    url: input.url,
    published_at: input.published_at,
    origin: input.origin || "unknown",
    available_content_level: level,
    original_title: input.title,
    main_event: parts[0] || input.title,
    detailed_facts: parts.slice(0, 18),
    unique_information: [],
    quotes,
    numbers,
    names: [...new Set(names)].slice(0, 8),
    organizations,
    locations,
    chronology,
    reactions,
    missing_information:
      level === "metadata_only"
        ? "Full publisher text was not available. Only title/snippet/metadata could be used."
        : level === "partial"
          ? "Only partial feed or snippet text was available. Do not claim the full article was read."
          : "Long feed or stored source text was available to the application. This is not a guarantee the live webpage was fetched.",
    available_text: available_text.slice(0, 8000),
  };
}

export function markUniqueNotes(notes: SourceNote[]) {
  return notes.map((note) => {
    const unique = note.detailed_facts.filter((fact) => {
      return !notes.some(
        (other) =>
          other.source_row_id !== note.source_row_id &&
          other.detailed_facts.some((row) => overlapScore(row, fact) >= 0.5),
      );
    });
    return { ...note, unique_information: unique.slice(0, 10) };
  });
}

export function utilizationFromNotes(notes: SourceNote[]): SourceUtilization[] {
  return notes.map((note) => ({
    source_row_id: note.source_row_id,
    name: note.source_name,
    url: note.url,
    available_content_level: note.available_content_level,
    chars: note.available_text.length,
    facts_extracted: note.detailed_facts.length,
    unique_facts: note.unique_information.length,
    quotes_extracted: note.quotes.length,
    context_extracted: note.locations.length + note.organizations.length + note.chronology.length,
    source_used_in_article: note.available_content_level !== "metadata_only" || note.detailed_facts.length > 0,
  }));
}

export function sourceFingerprint(ids: string[]) {
  return [...ids].sort().join(",");
}

export function packSourceNotes(notes: SourceNote[], maxChars = 18000) {
  const blocks = notes.map((note, index) => {
    const lines = [
      `[S${index + 1}] id=${note.source_row_id}`,
      `publisher=${note.source_name}`,
      `url=${note.url}`,
      `published=${note.published_at || "unknown"}`,
      `origin=${note.origin}`,
      `content_level=${note.available_content_level}`,
      `title=${note.original_title}`,
      note.unique_information.length ? `unique=${note.unique_information.join(" | ")}` : "",
      note.quotes.length ? `quotes=${note.quotes.map((row) => `${row.speaker}: ${row.quote}`).join(" | ")}` : "",
      note.numbers.length ? `numbers=${note.numbers.join(" | ")}` : "",
      note.chronology.length ? `chronology=${note.chronology.join(" | ")}` : "",
      note.reactions.length ? `reactions=${note.reactions.join(" | ")}` : "",
      `facts=${note.detailed_facts.join(" | ")}`,
      note.available_text ? `text=${note.available_text}` : "",
      `limitation=${note.missing_information}`,
    ].filter(Boolean);
    return lines.join("\n");
  });
  let packed = blocks.join("\n\n");
  let truncated = false;
  if (packed.length <= maxChars) return { packed, truncated };
  truncated = true;
  const slim = notes.map((note, index) =>
    [
      `[S${index + 1}] id=${note.source_row_id}`,
      `publisher=${note.source_name}`,
      `url=${note.url}`,
      `content_level=${note.available_content_level}`,
      `title=${note.original_title}`,
      `unique=${note.unique_information.slice(0, 6).join(" | ")}`,
      `quotes=${note.quotes.slice(0, 3).map((row) => `${row.speaker}: ${row.quote}`).join(" | ")}`,
      `numbers=${note.numbers.slice(0, 6).join(" | ")}`,
      `chronology=${note.chronology.slice(0, 4).join(" | ")}`,
      `facts=${note.detailed_facts.slice(0, 8).join(" | ")}`,
    ].join("\n"),
  );
  packed = slim.join("\n\n").slice(0, maxChars);
  return { packed, truncated };
}
