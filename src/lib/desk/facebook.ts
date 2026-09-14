export const META_GRAPH_VERSION = "v21.0";

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

async function graph(path: string, init?: RequestInit) {
  const secrets = readFacebookSecrets();
  if (!secrets.token || !secrets.pageId) {
    throw new Error("Facebook is not configured. Set META_ACCESS_TOKEN and META_PAGE_ID.");
  }
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}${path}`);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", secrets.token);
  const res = await fetch(url.toString(), init);
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw };
  }
  if (!res.ok || json?.error) {
    const message = json?.error?.message || raw.slice(0, 240) || `Facebook HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
}

export async function probeFacebookPage() {
  const secrets = readFacebookSecrets();
  if (!secrets.token || !secrets.pageId) {
    return { ok: false as const, status: "not_configured" as const, pageName: null as string | null, pageId: "" };
  }
  const data = await graph(`/${encodeURIComponent(secrets.pageId)}?fields=id,name`);
  return {
    ok: true as const,
    status: "ready" as const,
    pageName: String(data?.name || secrets.pageName || ""),
    pageId: String(data?.id || secrets.pageId),
  };
}

export async function publishPagePhoto(input: { imageUrl: string; caption: string }) {
  const secrets = readFacebookSecrets();
  const body = new URLSearchParams();
  body.set("url", input.imageUrl);
  body.set("caption", input.caption);
  body.set("published", "true");
  body.set("access_token", secrets.token);
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(secrets.pageId)}/photos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || `Facebook publish failed (${res.status})`);
  }
  return {
    photoId: String(json.id || ""),
    postId: String(json.post_id || json.id || ""),
  };
}
