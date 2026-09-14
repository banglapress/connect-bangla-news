export type CardRatio = "1:1" | "4:5";

export type CardTemplate = {
  brand: string;
  ratio: CardRatio;
  accent: string;
  background: string;
  text: string;
  logoUrl: string;
};

export const DEFAULT_CARD_TEMPLATE: CardTemplate = {
  brand: "The Connect",
  ratio: "4:5",
  accent: "#9B1D1F",
  background: "#F6F1E8",
  text: "#16110C",
  logoUrl: "/logo.png",
};

export function cardSize(ratio: CardRatio) {
  return ratio === "1:1" ? { width: 1080, height: 1080 } : { width: 1080, height: 1350 };
}

export function parseCardTemplate(value: unknown): CardTemplate {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ratio = row.ratio === "1:1" ? "1:1" : "4:5";
  return {
    brand: String(row.brand || DEFAULT_CARD_TEMPLATE.brand),
    ratio,
    accent: String(row.accent || DEFAULT_CARD_TEMPLATE.accent),
    background: String(row.background || DEFAULT_CARD_TEMPLATE.background),
    text: String(row.text || DEFAULT_CARD_TEMPLATE.text),
    logoUrl: String(row.logoUrl || DEFAULT_CARD_TEMPLATE.logoUrl),
  };
}

export type CardCopy = {
  headline: string;
  support: string;
  category: string;
  dateLabel: string;
};

export function clipText(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}
