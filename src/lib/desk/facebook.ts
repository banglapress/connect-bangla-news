export const META_GRAPH_VERSION = "v21.0";

export const PAGE_PUBLISH_PERMISSIONS = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const;

export type FacebookConfig = {
  configured: boolean;
  pageId: string;
  pageName: string | null;
  status: "not_configured" | "ready";
};

function readEnv(name: string) {
  if (typeof process === "undefined") return "";
  return String(process.env[name] || "").trim();
}

export function readFacebookSecrets() {
  return {
    token: readEnv("META_ACCESS_TOKEN") || readEnv("FACEBOOK_PAGE_ACCESS_TOKEN"),
    pageId: readEnv("META_PAGE_ID") || readEnv("FACEBOOK_PAGE_ID"),
    pageName: readEnv("META_PAGE_NAME") || readEnv("FACEBOOK_PAGE_NAME") || null,
  };
}

export function facebookConfigured() {
  const secrets = readFacebookSecrets();
  return Boolean(secrets.token && secrets.pageId);
}

export function facebookPublicStatus(): FacebookConfig {
  const secrets = readFacebookSecrets();
  const configured = Boolean(secrets.token && secrets.pageId);
  return {
    configured,
    pageId: configured ? secrets.pageId : "",
    pageName: secrets.pageName,
    status: configured ? "ready" : "not_configured",
  };
}

export function maskPageId(pageId: string) {
  if (!pageId) return "";
  if (pageId.length <= 4) return "••••";
  return `••••${pageId.slice(-4)}`;
}

function graphErrorMessage(json: any, fallback: string) {
  const message = String(json?.error?.message || fallback);
  if (/publish_actions/i.test(message)) {
    return [
      "Facebook rejected this token for Page photo publishing.",
      "META_ACCESS_TOKEN must be a Page access token with pages_manage_posts",
      "(plus pages_show_list and pages_read_engagement).",
      "Do not use a User token or the deprecated publish_actions permission.",
      "Generate a Page token in Graph API Explorer by selecting the Page, then set META_ACCESS_TOKEN on the host.",
    ].join(" ");
  }
  if (/expired|session has expired|invalid oauth/i.test(message)) {
    return "Facebook Page access token is expired or invalid. Generate a new Page access token and update META_ACCESS_TOKEN.";
  }
  return message;
}

async function graphGet(pathAndQuery: string, token: string) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}${pathAndQuery}`);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw };
  }
  if (!res.ok || json?.error) {
    throw new Error(graphErrorMessage(json, raw.slice(0, 240) || `Facebook HTTP ${res.status}`));
  }
  return json;
}

function samePageId(left: string, right: string) {
  return String(left || "").trim() === String(right || "").trim();
}

async function resolvePageAccessToken() {
  const secrets = readFacebookSecrets();
  if (!secrets.token || !secrets.pageId) {
    throw new Error("Facebook is not configured. Set META_ACCESS_TOKEN and META_PAGE_ID.");
  }

  try {
    const page = await graphGet(
      `/${encodeURIComponent(secrets.pageId)}?fields=id,name,access_token`,
      secrets.token,
    );
    const pageToken = String(page?.access_token || "").trim();
    return {
      token: pageToken || secrets.token,
      pageId: String(page?.id || secrets.pageId),
      pageName: String(page?.name || secrets.pageName || ""),
    };
  } catch (first) {
    try {
      const accounts = await graphGet("/me/accounts?fields=id,name,access_token", secrets.token);
      const pages = Array.isArray(accounts?.data) ? accounts.data : [];
      const match = pages.find((row: any) => samePageId(String(row?.id || ""), secrets.pageId));
      if (match?.access_token) {
        return {
          token: String(match.access_token),
          pageId: String(match.id),
          pageName: String(match.name || secrets.pageName || ""),
        };
      }
    } catch {
      /* fall through to original error */
    }
    throw first;
  }
}

export async function probeFacebookPage() {
  const secrets = readFacebookSecrets();
  if (!secrets.token || !secrets.pageId) {
    return { ok: false as const, status: "not_configured" as const, pageName: null as string | null, pageId: "" };
  }
  const page = await resolvePageAccessToken();
  return {
    ok: true as const,
    status: "ready" as const,
    pageName: page.pageName,
    pageId: page.pageId,
  };
}

export async function publishPagePhoto(input: { imageUrl: string; caption: string }) {
  const page = await resolvePageAccessToken();
  const body = new URLSearchParams();
  body.set("url", input.imageUrl);
  body.set("caption", input.caption);
  body.set("published", "true");
  body.set("access_token", page.token);
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(page.pageId)}/photos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw };
  }
  if (!res.ok || json?.error) {
    throw new Error(graphErrorMessage(json, raw.slice(0, 240) || `Facebook publish failed (${res.status})`));
  }
  return {
    photoId: String(json.id || ""),
    postId: String(json.post_id || json.id || ""),
  };
}
