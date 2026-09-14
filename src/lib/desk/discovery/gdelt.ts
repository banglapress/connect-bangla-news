import type { DiscoveryHit, DiscoveryProvider } from "./types";

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";

function queryFromTitle(title: string) {
  const words = title
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);
  const phrase = words.join(" ");
  return phrase
    ? `(${phrase}) (domain:bdnews24.com OR domain:bssnews.net OR domain:prothomalo.com OR domain:bbc.com OR domain:dw.com OR sourcecountry:BG)`
    : "sourcecountry:BG";
}

export const gdeltProvider: DiscoveryProvider = {
  name: "gdelt",
  async searchRelated({ title, urls }) {
    const params = new URLSearchParams({
      query: queryFromTitle(title),
      mode: "ArtList",
      format: "json",
      maxrecords: "25",
      timespan: "3d",
      sort: "DateDesc",
    });
    const res = await fetch(`${GDELT}?${params.toString()}`, {
      headers: { "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)" },
    });
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const text = await res.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("GDELT returned non-JSON");
    }
    const known = new Set(urls.map((u) => u.replace(/\/$/, "")));
    const articles = payload.articles ?? payload.Articles ?? [];
    return (articles as any[])
      .map((row) => {
        const url = String(row.url || row.URL || "");
        return {
          title: String(row.title || row.Title || url),
          url,
          domain: String(row.domain || row.Domain || ""),
          publishedAt: row.seendate || row.seenDate || null,
          relevance: 0.5,
          provider: "gdelt",
        } satisfies DiscoveryHit;
      })
      .filter((hit) => hit.url.startsWith("http") && !known.has(hit.url.replace(/\/$/, "")));
  },
};
