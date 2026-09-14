export type RssItem = {
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  imageUrl: string | null;
};

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (match?.[1]) return decode(match[1]);
  }
  return "";
}

function attr(block: string, tagName: string, attrName: string) {
  const match = block.match(new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["'][^>]*/?>`, "i"));
  return match?.[1] ?? "";
}

function firstUrl(block: string) {
  const linkHref = attr(block, "link", "href");
  if (linkHref) return linkHref;
  const link = tag(block, ["link"]);
  if (link.startsWith("http")) return link;
  const guid = tag(block, ["guid"]);
  if (guid.startsWith("http")) return guid;
  return "";
}

function imageFrom(block: string) {
  return (
    attr(block, "media:content", "url") ||
    attr(block, "media:thumbnail", "url") ||
    attr(block, "enclosure", "url") ||
    null
  );
}

export function parseFeed(xml: string): RssItem[] {
  const chunks = [...xml.matchAll(/<(item|entry)\\b[\\s\\S]*?<\\/\1>/gi)].map((m) => m[0]);
  return chunks.map((block) => {
    const title = tag(block, ["title"]);
    const url = firstUrl(block);
    const excerpt = tag(block, ["description", "summary", "content:encoded", "content"]);
    const published = tag(block, ["pubDate", "published", "updated", "dc:date"]);
    let publishedAt: string | null = null;
    if (published) {
      const date = new Date(published);
      if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString();
    }
    return {
      title: title || url,
      url,
      excerpt: excerpt.slice(0, 600),
      publishedAt,
      imageUrl: imageFrom(block),
    };
  }).filter((item) => item.url.startsWith("http"));
}

export async function fetchFeedXml(rssUrl: string): Promise<string> {
  const headers = {
    "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  };
  let lastError = "RSS আনা যায়নি";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(rssUrl, { headers, redirect: "follow" });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
      } else {
        const text = await res.text();
        if (!text.includes("<item") && !text.includes("<entry")) {
          lastError = "ফিডে item/entry নেই";
        } else {
          return text;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "নেটওয়ার্ক ত্রুটি";
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }
  throw new Error(lastError);
}
