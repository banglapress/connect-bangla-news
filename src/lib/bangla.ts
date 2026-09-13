const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
}

const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const BN_DAYS = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
];

function dhaka(date: Date): Date {
  return new Date(date.getTime() + 6 * 60 * 60 * 1000);
}

export function formatBanglaDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = dhaka(new Date(value));
  return `${toBanglaDigits(d.getUTCDate())} ${BN_MONTHS[d.getUTCMonth()]} ${toBanglaDigits(d.getUTCFullYear())}`;
}

export function formatBanglaDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = dhaka(new Date(value));
  let hours = d.getUTCHours();
  const suffix = hours < 12 ? "পূর্বাহ্ণ" : "অপরাহ্ণ";
  hours = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatBanglaDate(value)}, ${toBanglaDigits(hours)}:${toBanglaDigits(minutes)} ${suffix}`;
}

export function formatBanglaFullDate(value: string | Date): string {
  const d = dhaka(new Date(value));
  return `${BN_DAYS[d.getUTCDay()]}, ${formatBanglaDate(value)}`;
}

export function slugifyBangla(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "khobor"}-${suffix}`;
}

export function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "lekhok"
  );
}

export function writerPath(name: string | null | undefined): string {
  if (!name) return "/";
  return `/writer/${encodeURIComponent(slugifyName(name))}`;
}
