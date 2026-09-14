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
    const open = new RegExp("<" + name + "(?:\\s[^>]*)?>", "i");
    const close = new RegExp("</" + name + ">", "i");
    const start = block.search(open);
    if (start < 0) continue;
    const afterOpen = block.indexOf(">", start);
    if (afterOpen < 0) continue;
    const end = block.substring(afterOpen + 1).search(close);
    if (end < 0) continue;
    return decode(block.substring(afterOpen + 1, afterOpen + 1 + end));
  }
  return "";
}

function attr(block: string, tagName: string, attrName: string) {
  const needle = "<" + tagName;
  let from = 0;
  while (from < block.length) {
    const start = block.toLowerCase().indexOf(needle.toLowerCase(), from);
    if (start < 0) return "";
    const end = block.indexOf(">", start);
    if (end < 0) return "";
    const tagText = block.slice(start, end + 1);
    const pattern = new RegExp(attrName + "=[\"']([^\"']+)[\"']", "i");
    const match = tagText.match(pattern);
    if (match?.[1]) return match[1];
    from = end + 1;
  }
  return "";
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

function extractBlocks(xml: string, tagName: string) {
  const blocks: string[] = [];
  const open = "<" + tagName;
  const close = "</" + tagName + ">";
  const lower = xml.toLowerCase();
  let from = 0;
  while (from < xml.length) {
    const start = lower.indexOf(open, from);
    if (start < 0) break;
    const nextChar = xml[start + open.length];
    if (nextChar && nextChar !== ">" && nextChar !== " " && nextChar !== "\n" && nextChar !== "\t") {
      from = start + open.length;
      continue;
    }
    const end = lower.indexOf(close, start);
    if (end < 0) break;
    blocks.push(xml.slice(start, end + close.length));
    from = end + close.length;
  }
  return blocks;
}

const FEED_TEXT_LIMIT = 8000;

export function parseFeed(xml: string): RssItem[] {
  const chunks = [...extractBlocks(xml, "item"), ...extractBlocks(xml, "entry")];
  return chunks
    .map((block) => {
      const title = tag(block, ["title"]);
      const url = firstUrl(block);
      const encoded = tag(block, ["content:encoded", "content"]);
      const summary = tag(block, ["description", "summary"]);
      const excerpt = (encoded.length >= summary.length ? encoded : summary).slice(0, FEED_TEXT_LIMIT);
      const published = tag(block, ["pubDate", "published", "updated", "dc:date"]);
      let publishedAt: string | null = null;
      if (published) {
        const date = new Date(published);
        if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString();
      }
      return {
        title: title || url,
        url,
        excerpt,
        publishedAt,
        imageUrl: imageFrom(block),
      };
    })
    .filter((item) => item.url.startsWith("http"));
}

export async function fetchFeedXml(rssUrl: string): Promise<string> {
  const headers = {
    "User-Agent": "TheConnectDesk/1.0 (+https://www.theconnectbd.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  };
  let lastError = "RSS feed could not be fetched";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(rssUrl, { headers, redirect: "follow" });
      if (!res.ok) {
        lastError = "HTTP " + res.status;
      } else {
        const text = await res.text();
        if (!text.includes("<item") && !text.includes("<entry")) {
          lastError = "Feed has no item or entry nodes";
        } else {
          return text;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }
  throw new Error(lastError);
}
