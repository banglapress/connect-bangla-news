export const TRUSTED_DISCOVERY_DOMAINS = [
  "prothomalo.com",
  "bangla.bdnews24.com",
  "bdnews24.com",
  "bssnews.net",
  "bbc.com",
  "bbc.co.uk",
  "dw.com",
] as const;

export function hostnameOf(urlOrHost: string): string {
  try {
    const value = urlOrHost.includes("://") ? urlOrHost : `https://${urlOrHost}`;
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return urlOrHost.replace(/^www\./, "").toLowerCase();
  }
}

export function isTrustedDiscoveryDomain(urlOrHost: string): boolean {
  const host = hostnameOf(urlOrHost);
  return TRUSTED_DISCOVERY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function googleNewsSiteFilter(): string {
  return [
    "site:prothomalo.com",
    "site:bangla.bdnews24.com",
    "site:bssnews.net",
    "site:bbc.com/bengali",
    "site:dw.com",
  ].join(" OR ");
}
