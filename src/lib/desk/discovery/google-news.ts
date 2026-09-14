import { parseFeed } from "@/lib/desk/rss";
import { canonicalizeUrl } from "@/lib/desk/url";
import { googleNewsSiteFilter, hostnameOf } from "./trusted";
import type { DiscoveryDiagnostic, DiscoveryHit, DiscoveryProvider, DiscoveryQuery, DiscoverySearchContext } from "./types";

const ENDPOINT = "https://news.google.com/rss/search";
const FETCH_TIMEOUT_MS = 10000;

function preview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}

function encodeSearch(query: string) {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("hl", "bn");
  params.set("gl", "BD");
  params.set("ceid", "BD:bn");
  return `${ENDPOINT}?${params.toString()}`;
}

function sourceMap(xml: string) {
  const map = new Map<string, { domain: string; name: string }>();
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const link = block.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() || "";
    const sourceUrl = block.match(/<source[^>]*url=["']([^"']+)["']/i)?.[1] || "";
    const sourceName = block.match(/<source[^>]*>([^<]*)<\/source>/i)?.[1] || "";
    if (link) map.set(link, { domain: sourceUrl ? hostnameOf(sourceUrl) : "", name: sourceName });
  }
  return map;
}

function stripSourceSuffix(title: string, sourceName: string) {
  const cleaned = title.replace(/\s+-\s+[^-]+$/, "").trim();
  if (sourceName && title.endsWith(sourceName)) return title.slice(0, -sourceName.length).replace(/[\s-]+$/, "").trim();
  return cleaned || title;
}

async function resolvePublisherUrl(googleUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(googleUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
      },
    });
    const finalUrl = res.url || googleUrl;
    const host = hostnameOf(finalUrl);
    if (host && !host.includes("news.google.") && !host.includes("google.com")) {
      return canonicalizeUrl(finalUrl) || finalUrl;
    }
  } catch {
    // Keep the Google News URL. Never scrape publisher HTML.
  } finally {
    clearTimeout(timer);
  }
  return googleUrl;
}

async function fetchRss(query: string, label: string): Promise<{ hits: DiscoveryHit[]; diagnostic: DiscoveryDiagnostic }> {
  const requestUrl = encodeSearch(query);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
      },
    });
    const text = await res.text();
    const durationMs = Date.now() - started;
    if (res.status !== 200) {
      return {
        hits: [],
        diagnostic: {
          label,
          query,
          requestUrl,
          provider: "google_news",
          status: res.status,
          resultCount: 0,
          durationMs,
          error: `Google News HTTP ${res.status} (${res.statusText || "error"}). Body: ${preview(text) || "empty"}`,
          bodyPreview: preview(text),
          rateLimited: res.status === 429,
        },
      };
    }
    const parsed = parseFeed(text);
    const sources = sourceMap(text);
    const hits: DiscoveryHit[] = [];
    for (const item of parsed.slice(0, 20)) {
      const meta = sources.get(item.url);
      const sourceName = meta?.name || null;
      const domain = meta?.domain || hostnameOf(item.url);
      hits.push({
        title: stripSourceSuffix(item.title, sourceName || ""),
        url: item.url,
        domain,
        sourceName,
        publishedAt: item.publishedAt,
        snippet: item.excerpt || null,
        relevance: 0,
        provider: "google_news",
        query,
      });
    }
    return {
      hits,
      diagnostic: {
        label,
        query,
        requestUrl,
        provider: "google_news",
        status: res.status,
        resultCount: hits.length,
        durationMs,
        error: hits.length ? null : "Google News returned no items",
        bodyPreview: preview(text),
      },
    };
  } catch (err) {
    const message = err instanceof DOMException && err.name === "AbortError"
      ? "Network timeout talking to Google News (10s)"
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      hits: [],
      diagnostic: {
        label,
        query,
        requestUrl,
        provider: "google_news",
        status: null,
        resultCount: 0,
        durationMs: Date.now() - started,
        error: message,
        bodyPreview: null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const googleNewsProvider: DiscoveryProvider = {
  name: "google_news",
  async search(queries: DiscoveryQuery[], _context: DiscoverySearchContext) {
    const diagnostics: DiscoveryDiagnostic[] = [];
    const collected: DiscoveryHit[] = [];
    const planned: { label: string; text: string }[] = [];

    const bn = queries.filter((row) => row.lang === "bn");
    const en = queries.filter((row) => row.lang === "en");
    if (bn[0]) planned.push({ label: "A. Google News Bangla query", text: `${bn[0].text} when:7d` });
    if (bn[0]) planned.push({ label: "B. Google News trusted-domain query", text: `${bn[0].text} when:7d (${googleNewsSiteFilter()})` });
    else if (queries[0]) planned.push({ label: "B. Google News trusted-domain query", text: `${queries[0].text} when:7d (${googleNewsSiteFilter()})` });
    if (en[0]) planned.push({ label: "C. Google News English variant", text: `${en[0].text} when:7d` });
    else if (bn[1]) planned.push({ label: "C. Google News second Bangla query", text: `${bn[1].text} when:7d` });

    for (const row of planned.slice(0, 3)) {
      const result = await fetchRss(row.text, row.label);
      diagnostics.push(result.diagnostic);
      collected.push(...result.hits);
      if (collected.length >= 12 && diagnostics.some((item) => !item.error)) break;
    }

    const resolved: DiscoveryHit[] = [];
    const seen = new Set<string>();
    let resolveBudget = 8;
    for (const hit of collected) {
      let resolvedUrl = hit.url;
      if (resolveBudget > 0 && hit.url.includes("news.google.com")) {
        resolvedUrl = await resolvePublisherUrl(hit.url);
        resolveBudget -= 1;
      }
      const url = canonicalizeUrl(resolvedUrl) || resolvedUrl;
      if (seen.has(url)) continue;
      seen.add(url);
      resolved.push({ ...hit, url, domain: hit.domain || hostnameOf(url) });
      if (resolved.length >= 20) break;
    }

    return { hits: resolved, diagnostics, provider: "google_news" };
  },
};
