const DROP_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "spm", "ref",
];

export function canonicalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const params = url.searchParams;
    for (const key of [...params.keys()]) {
      if (DROP_PARAMS.includes(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        params.delete(key);
      }
    }
    url.search = params.toString();
    let href = url.toString();
    if (href.endsWith("/") && url.pathname !== "/") href = href.slice(0, -1);
    return href;
  } catch {
    return null;
  }
}

export function clusterKeyFromTitle(title: string): string {
  const folded = title
    .toLowerCase()
    .replace(/[\u09be-\u09c4\u09c7\u09c8\u09cb\u09cc\u09cd\u0981-\u0983]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (folded || "story").slice(0, 96);
}
