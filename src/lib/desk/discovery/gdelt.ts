import { canonicalizeUrl } from "@/lib/desk/url";
import { hostnameOf } from "./trusted";
import type { DiscoveryDiagnostic, DiscoveryHit, DiscoveryProvider, DiscoveryQuery, DiscoverySearchContext } from "./types";

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";
const COOLDOWN_MS = 6000;
let lastCallAt = 0;

function preview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}

function encodeRequest(query: string) {
  const params = new URLSearchParams();
  params.set("query", query);
  params.set("mode", "ArtList");
  params.set("format", "json");
  params.set("maxrecords", "15");
  params.set("timespan", "3d");
  params.set("sort", "DateDesc");
  return `${GDELT}?${params.toString()}`;
}

function parseArticles(payload: any, query: string): DiscoveryHit[] {
  const articles = payload?.articles ?? payload?.Articles ?? [];
  if (!Array.isArray(articles)) return [];
  return articles
    .map((row: any) => {
      const url = String(row.url || row.URL || "");
      return {
        title: String(row.title || row.Title || url),
        url,
        domain: String(row.domain || row.Domain || hostnameOf(url)),
        sourceName: String(row.domain || row.Domain || "") || null,
        publishedAt: row.seendate || row.seenDate || null,
        snippet: String(row.snippet || row.excerpt || "") || null,
        relevance: 0,
        provider: "gdelt",
        query,
      } satisfies DiscoveryHit;
    })
    .filter((hit: DiscoveryHit) => hit.url.startsWith("http"));
}

export const gdeltProvider: DiscoveryProvider = {
  name: "gdelt",
  async search(queries: DiscoveryQuery[], _context: DiscoverySearchContext) {
    const preferred = queries.find((row) => row.lang === "en") || queries[0];
    if (!preferred) {
      return {
        hits: [],
        provider: "gdelt",
        diagnostics: [{
          label: "GDELT fallback",
          query: "",
          requestUrl: "",
          provider: "gdelt",
          status: null,
          resultCount: 0,
          durationMs: 0,
          error: "No query available for GDELT fallback",
          bodyPreview: null,
        }],
      };
    }

    const wait = lastCallAt + COOLDOWN_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    const requestUrl = encodeRequest(preferred.text);
    const started = Date.now();
    lastCallAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(requestUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
        },
      });
      const text = await res.text();
      const durationMs = Date.now() - started;
      if (res.status === 429) {
        return {
          hits: [],
          provider: "gdelt",
          diagnostics: [{
            label: "GDELT fallback",
            query: preferred.text,
            requestUrl,
            provider: "gdelt",
            status: 429,
            resultCount: 0,
            durationMs,
            error: "GDELT HTTP 429 rate_limited. No retry.",
            bodyPreview: preview(text),
            rateLimited: true,
          }],
        };
      }
      if (res.status !== 200) {
        return {
          hits: [],
          provider: "gdelt",
          diagnostics: [{
            label: "GDELT fallback",
            query: preferred.text,
            requestUrl,
            provider: "gdelt",
            status: res.status,
            resultCount: 0,
            durationMs,
            error: `GDELT HTTP ${res.status} (${res.statusText || "error"}). Body: ${preview(text) || "empty"}`,
            bodyPreview: preview(text),
          }],
        };
      }
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        return {
          hits: [],
          provider: "gdelt",
          diagnostics: [{
            label: "GDELT fallback",
            query: preferred.text,
            requestUrl,
            provider: "gdelt",
            status: res.status,
            resultCount: 0,
            durationMs,
            error: `JSON parse failure. Body starts: ${preview(text) || "empty"}`,
            bodyPreview: preview(text),
          }],
        };
      }
      const hits = parseArticles(payload, preferred.text).map((hit) => ({
        ...hit,
        url: canonicalizeUrl(hit.url) || hit.url,
      }));
      return {
        hits,
        provider: "gdelt",
        diagnostics: [{
          label: "GDELT fallback",
          query: preferred.text,
          requestUrl,
          provider: "gdelt",
          status: res.status,
          resultCount: hits.length,
          durationMs,
          error: null,
          bodyPreview: preview(text),
        }],
      };
    } catch (err) {
      const message = err instanceof DOMException && err.name === "AbortError"
        ? "Network timeout talking to GDELT (12s)"
        : err instanceof Error
          ? err.message
          : String(err);
      return {
        hits: [],
        provider: "gdelt",
        diagnostics: [{
          label: "GDELT fallback",
          query: preferred.text,
          requestUrl,
          provider: "gdelt",
          status: null,
          resultCount: 0,
          durationMs: Date.now() - started,
          error: message,
          bodyPreview: null,
        }],
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
