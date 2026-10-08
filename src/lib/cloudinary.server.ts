import { createHash } from "node:crypto";

function env(name: string) {
  if (typeof process === "undefined") return "";
  return String(process.env[name] || "").trim();
}

export function cloudinaryServerConfig() {
  return {
    cloudName: env("CLOUDINARY_CLOUD_NAME") || env("VITE_CLOUDINARY_CLOUD_NAME"),
    apiKey: env("CLOUDINARY_API_KEY"),
    apiSecret: env("CLOUDINARY_API_SECRET"),
    uploadPreset: env("CLOUDINARY_UPLOAD_PRESET") || env("VITE_CLOUDINARY_UPLOAD_PRESET"),
  };
}

export function cloudinaryConfiguredForServer() {
  const cfg = cloudinaryServerConfig();
  return Boolean(cfg.cloudName && ((cfg.apiKey && cfg.apiSecret) || cfg.uploadPreset));
}

function signParams(params: Record<string, unknown>, apiSecret: string) {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const stringValue = Array.isArray(value) ? value.join(",") : String(value);
      return key + "=" + stringValue;
    })
    .join("&");

  return createHash("sha1").update(normalized + apiSecret).digest("hex");
}

export function createCloudinaryUploadSignature(params: Record<string, unknown>) {
  const cfg = cloudinaryServerConfig();
  if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret) {
    throw new Error("Cloudinary server credentials are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  }

  const timestamp = Number(params.timestamp || Math.floor(Date.now() / 1000));
  const signedParams = { ...params, source: params.source || "uw", timestamp };

  return {
    signature: signParams(signedParams, cfg.apiSecret),
    timestamp,
    apiKey: cfg.apiKey,
  };
}

export async function uploadCloudinaryImage(input: {
  data: string | Blob | Uint8Array;
  mime?: string;
  folder?: string;
  publicId?: string;
}) {
  const cfg = cloudinaryServerConfig();
  if (!cfg.cloudName) throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME.");

  const form = new FormData();
  if (typeof input.data === "string") {
    form.append("file", input.data);
  } else if (input.data instanceof Blob) {
    form.append("file", input.data, "upload");
  } else {
    const copy = new Uint8Array(input.data.byteLength);
    copy.set(input.data);
    form.append("file", new Blob([copy], { type: input.mime || "application/octet-stream" }), "upload");
  }

  if (input.folder) form.append("folder", input.folder);
  if (input.publicId) form.append("public_id", input.publicId);

  const headers: Record<string, string> = {};
  if (cfg.apiKey && cfg.apiSecret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signed: Record<string, string | number> = { timestamp };
    if (input.folder) signed.folder = input.folder;
    if (input.publicId) signed.public_id = input.publicId;
    form.append("api_key", cfg.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("signature", signParams(signed, cfg.apiSecret));
    headers.Authorization = "Basic " + Buffer.from(cfg.apiKey + ":" + cfg.apiSecret).toString("base64");
  } else if (cfg.uploadPreset) {
    form.append("upload_preset", cfg.uploadPreset);
  } else {
    throw new Error("Cloudinary upload credentials are missing. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  }

  const res = await fetch(
    "https://api.cloudinary.com/v1_1/" + encodeURIComponent(cfg.cloudName) + "/image/upload",
    { method: "POST", headers, body: form },
  );

  const json = (await res.json()) as {
    secure_url?: string;
    public_id?: string;
    asset_id?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || "Cloudinary upload failed (HTTP " + res.status + ")");
  }

  return { url: json.secure_url, publicId: json.public_id || null, assetId: json.asset_id || null };
}
