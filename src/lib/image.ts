export function publicImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace("/object/sign/", "/object/public/");
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}
