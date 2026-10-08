export function bytesFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Card image must be a JPEG or PNG data URL");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime: match[1], bytes };
}

export async function uploadCardImage(_supabase: any, _storyId: string, dataUrl: string) {
  bytesFromDataUrl(dataUrl);
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || "").trim();
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || process.env.VITE_CLOUDINARY_UPLOAD_PRESET || "").trim();

  if (!cloud || !preset) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.");
  }

  const form = new FormData();
  form.append("file", dataUrl);
  form.append("upload_preset", preset);
  form.append("folder", "news/cards");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };

  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || "Cloudinary-এ Facebook card save করা যায়নি");
  }

  return json.secure_url;
}