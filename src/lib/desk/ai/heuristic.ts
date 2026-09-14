import type { AIProvider, ExtractedClaim, SourcePacket } from "./types";

function splitClaims(text: string): string[] {
  return text
    .split(/[\u0964.!?\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 12 && part.length <= 240);
}

function classify(text: string): ExtractedClaim["type"] {
  if (/\d{1,2}[\/.-]\d{1,2}|\d{4}/.test(text)) return "date";
  if (/\d/.test(text) || /[\u09e6-\u09ef]/.test(text)) return "number";
  return "general";
}

export const heuristicProvider: AIProvider = {
  name: "heuristic",
  isConfigured() {
    return true;
  },
  async extractClaims(source) {
    const parts = splitClaims([source.title, source.excerpt].filter(Boolean).join(". "));
    const seen = new Set<string>();
    const claims: ExtractedClaim[] = [];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({ text: part, type: classify(part) });
    }
    if (!claims.length && source.title) claims.push({ text: source.title, type: "event" });
    return claims.slice(0, 8);
  },
  async summarizeTopic(sources) {
    const titles = sources.map((row) => row.title).filter(Boolean);
    return titles[0] || "Untitled story";
  },
};
