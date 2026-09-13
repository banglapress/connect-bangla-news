export type SiteCategory = {
  id?: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  show_in_nav?: boolean;
  nav_order?: number;
  sort_order?: number;
};

export const CATEGORIES: SiteCategory[] = [
  { name: "জাতীয়", slug: "national", show_in_nav: true, nav_order: 1 },
  { name: "আন্তর্জাতিক", slug: "international", show_in_nav: true, nav_order: 2 },
  { name: "খেলা", slug: "sports", show_in_nav: true, nav_order: 3 },
  { name: "অর্থনীতি", slug: "economy", show_in_nav: true, nav_order: 4 },
  { name: "বাণিজ্য", slug: "business", show_in_nav: true, nav_order: 5 },
  { name: "লাইফস্টাইল", slug: "lifestyle", show_in_nav: true, nav_order: 6 },
  { name: "মতামত", slug: "opinion", show_in_nav: true, nav_order: 7 },
  { name: "শিক্ষা", slug: "education", show_in_nav: true, nav_order: 8 },
  { name: "সংস্কৃতি", slug: "culture", show_in_nav: true, nav_order: 9 },
  { name: "প্রবাস", slug: "probash", show_in_nav: true, nav_order: 10 },
  { name: "বিনোদন", slug: "entertainment", show_in_nav: true, nav_order: 11 },
];

export const RESERVED_SECTIONS = ["admin", "auth", "search", "news", "category", "login", "api", "writer"];

export function categoryName(slug: string, list: SiteCategory[] = CATEGORIES): string {
  return list.find((c) => c.slug === slug)?.name ?? slug;
}

export function navCategories(list: SiteCategory[] = CATEGORIES): SiteCategory[] {
  return list.filter((c) => c.show_in_nav !== false && !c.parent_id).sort((a, b) => (a.nav_order ?? 0) - (b.nav_order ?? 0));
}
