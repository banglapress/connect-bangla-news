import type { DiscoveryDiagnostic, DiscoveryHit, DiscoverySearchResult } from "./types";

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";
const PROBE_QUERY = "bangladesh";

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

function preview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}

function networkMessage(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return "Network timeout talking to GDELT (12s)";
  const message = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNRESET|ENOTFOUND|certificate|socket/i.test(message)) {
    return `Network failure talking to GDELT: ${message}`;
  }
  return message;
}

function parseArticles(payload: any): DiscoveryHit[] {
  const articles = payload?.articles ?? payload?.Articles ?? [];
  if (!Array.isArray(articles)) return [];
  return articles.map((row: any) => {
    const url = String(row.url || row.URL || "");
    return {
      title: String(row.title || row.Title || url),
      url,
      domain: String(row.domain || row.Domain || ""),
      publishedAt: row.seendate || row.seenDate || null,
      relevance: 0.5,
      provider: "gdelt",
    };
  }).filter((hit: DiscoveryHit) => hit.url.startsWith("http"));
}

async function gdeltGet(query: string, label: string): Promise<{ hits: DiscoveryHit[]; diagnostic: DiscoveryDiagnostic }> {
  const requestUrl = encodeRequest(query);
  const started = Date.now();
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      console.info("[gdelt] request", { label, attempt, requestUrl });
      const res = await fetch(requestUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/json,text/plain,*/*",
          "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
        },
      });
      const headerBits = {
        contentType: res.headers.get("content-type"),
        retryAfter: res.headers.get("retry-after"),
      };
      const text = await res.text();
      const durationMs = Date.now() - started;
      console.info("[gdelt] response", {
        label,
        status: res.status,
        headerBits,
        durationMs,
        bodyPreview: preview(text),
      });
      if (res.status !== 200) {
        lastError = `GDELT HTTP ${res.status} (${res.statusText || "error"}). Body: ${preview(text) || "empty"}`;
        if (res.status === 429 && attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 900));
          continue;
        }
        return {
          hits: [],
          diagnostic: {
            label, query, requestUrl, provider: "gdelt", status: res.status,
            resultCount: 0, durationMs, error: lastError, bodyPreview: preview(text),
          },
        };
      }
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        return {
          hits: [],
          diagnostic: {
            label, query, requestUrl, provider: "gdelt", status: res.status,
            resultCount: 0, durationMs,
            error: `JSON parse failure. Body starts: ${preview(text) || "empty"}`,
            bodyPreview: preview(text),
          },
        };
      }
      const hits = parseArticles(payload);
      return {
        hits,
        diagnostic: {
          label, query, requestUrl, provider: "gdelt", status: res.status,
          resultCount: hits.length, durationMs, error: null, bodyPreview: preview(text),
        },
      };
    } catch (err) {
      lastError = networkMessage(err);
      console.error("[gdelt] exception", { label, attempt, requestUrl, error: lastError });
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    hits: [],
    diagnostic: {
      label, query, requestUrl, provider: "gdelt", status: null,
      resultCount: 0, durationMs: Date.now() - started, error: lastError, bodyPreview: null,
    },
  };
}

export function storyQueryFromTitle(title: string) {
  const latin = title.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  if (latin.length) return `${latin.slice(0, 6).join(" ")} Bangladesh`;
  return "Bangladesh sourcecountry:BG";
}

export function bengaliProbeQuery(title: string) {
  const words = title.replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
  return words.length ? words.join(" ") : title.slice(0, 40);
}

export async function searchGdelt(title: string, knownUrls: string[]): Promise<DiscoverySearchResult> {
  const known = new Set(knownUrls.map((u) => u.replace(/\/$/, "")));
  const diagnostics: DiscoveryDiagnostic[] = [];

  const probe = await gdeltGet(PROBE_QUERY, "A. fixed English connectivity test");
  diagnostics.push(probe.diagnostic);

  const storyQ = storyQueryFromTitle(title);
  const story = await gdeltGet(storyQ, "B. story English/entity query");
  diagnostics.push(story.diagnostic);

  const bnQ = bengaliProbeQuery(title);
  if (bnQ && bnQ !== storyQ) {
    const bn = await gdeltGet(bnQ, "C. Bengali headline-derived query");
    diagnostics.push(bn.diagnostic);
  }

  const merged = new Map<string, DiscoveryHit>();
  for (const hit of [...probe.hits, ...story.hits]) {
    const key = hit.url.replace(/\/$/, "");
    if (!known.has(key)) merged.set(key, hit);
  }
  return { hits: [...merged.values()].slice(0, 20), diagnostics };
}
