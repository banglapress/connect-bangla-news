const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALL = LETTERS + DIGITS;

function randomChar(source: string) {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return source[bytes[0] % source.length]!;
}

export function makePublicId(): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let value = "";
    for (let i = 0; i < 4; i++) value += randomChar(ALL);
    if (/[a-z]/.test(value) && /[0-9]/.test(value)) return value;
  }
  return randomChar(LETTERS) + randomChar(LETTERS) + randomChar(DIGITS) + randomChar(ALL);
}

export function isPublicId(value: string) {
  return /^[a-z0-9]{4}$/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

export function isArticlePathId(value: string) {
  const key = decodeURIComponent(value || "");
  return isPublicId(key) || /^[a-z0-9]{5,12}$/.test(key);
}

export function articlePath(article: { public_id?: string | null; slug?: string | null }) {
  if (article.public_id) return `/${article.public_id}`;
  if (article.slug && isArticlePathId(article.slug)) return `/${article.slug}`;
  if (article.slug) return `/news/${encodeURIComponent(article.slug)}`;
  return "/";
}
