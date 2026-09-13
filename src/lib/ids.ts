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
    let id = "";
    for (let i = 0; i < 4; i++) id += randomChar(ALL);
    if (/[a-z]/.test(id) && /[0-9]/.test(id)) return id;
  }
  return randomChar(LETTERS) + randomChar(LETTERS) + randomChar(DIGITS) + randomChar(ALL);
}

export function isPublicId(value: string) {
  return /^[a-z0-9]{4}$/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

export function isArticlePathId(value: string) {
  return isPublicId(value) || /^[a-z0-9]{10}$/.test(value);
}

export function articlePath(article: { public_id?: string | null; slug?: string | null }) {
  const id = article.public_id || article.slug;
  return id ? `/${id}` : "/";
}
