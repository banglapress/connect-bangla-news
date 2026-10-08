function env(name: string): string | undefined {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = vite?.[name] || (typeof process !== "undefined" ? process.env?.[name] : undefined);
  return value?.trim() || undefined;
}

export async function uploadNewsImage(file: File): Promise<string> {
  const cloud = env("VITE_CLOUDINARY_CLOUD_NAME") || env("CLOUDINARY_CLOUD_NAME");
  const preset = env("VITE_CLOUDINARY_UPLOAD_PRESET") || env("CLOUDINARY_UPLOAD_PRESET");

  if (!cloud || !preset) {
    throw new Error("Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", preset);
  body.append("folder", "news");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body,
  });
  const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || "Cloudinary-এ ছবি ওঠেনি");
  }
  return json.secure_url;
}
