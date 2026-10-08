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
  const { uploadCloudinaryImage } = await import("@/lib/cloudinary.server");
  const uploaded = await uploadCloudinaryImage({
    data: dataUrl,
    folder: "news/cards",
  });
  return uploaded.url;
}