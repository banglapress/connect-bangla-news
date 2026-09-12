import { supabase } from "@/integrations/supabase/client";

function env(name: string): string | undefined {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = vite?.[name] || (typeof process !== "undefined" ? process.env?.[name] : undefined);
  return value?.trim() || undefined;
}

export async function uploadNewsImage(file: File): Promise<string> {
  const cloud = env("VITE_CLOUDINARY_CLOUD_NAME") || env("CLOUDINARY_CLOUD_NAME");
  const preset = env("VITE_CLOUDINARY_UPLOAD_PRESET") || env("CLOUDINARY_UPLOAD_PRESET");

  if (cloud && preset) {
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

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("news-images").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("news-images").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("ছবির ঠিকানা তৈরি হয়নি");
  return data.publicUrl;
}
