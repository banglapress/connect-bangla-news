const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export function makePublicId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isPublicId(value: string): boolean {
  return /^[a-z0-9]{10}$/.test(value);
}
