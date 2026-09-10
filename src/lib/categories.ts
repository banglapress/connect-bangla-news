export const CATEGORIES = [
  { name: "জাতীয়", slug: "national" },
  { name: "আন্তর্জাতিক", slug: "international" },
  { name: "খেলা", slug: "sports" },
  { name: "অর্থনীতি", slug: "economy" },
  { name: "বাণিজ্য", slug: "business" },
  { name: "লাইফস্টাইল", slug: "lifestyle" },
  { name: "মতামত", slug: "opinion" },
  { name: "শিক্ষা", slug: "education" },
  { name: "সংস্কৃতি", slug: "culture" },
  { name: "প্রবাস", slug: "probash" },
  { name: "বিনোদন", slug: "entertainment" },
] as const;

export function categoryName(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}
