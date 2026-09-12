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
  { name: "বাংলাদেশ", slug: "bangladesh", show_in_nav: true, nav_order: 1 },
  { name: "রাজনীতি", slug: "rajniti", show_in_nav: false, nav_order: 2 },
  { name: "অপরাধ", slug: "oporadh", show_in_nav: false, nav_order: 3 },
  { name: "বিশ্ব", slug: "bishwo", show_in_nav: true, nav_order: 4 },
  { name: "অর্থনীতি", slug: "orthoniti", show_in_nav: true, nav_order: 5 },
  { name: "খেলা", slug: "khela", show_in_nav: true, nav_order: 6 },
  { name: "বিনোদন", slug: "binodon", show_in_nav: true, nav_order: 7 },
  { name: "লাইফস্টাইল", slug: "lifestyle", show_in_nav: true, nav_order: 8 },
  { name: "মতামত", slug: "motamot", show_in_nav: true, nav_order: 9 },
  { name: "প্রবাস", slug: "probash", show_in_nav: true, nav_order: 10 },
  { name: "ভিডিও", slug: "video", show_in_nav: true, nav_order: 11 },
];

export const RESERVED_SECTIONS = ["admin", "auth", "search", "news", "category", "login", "api"];

export function categoryName(slug: string, list: SiteCategory[] = CATEGORIES): string {
  return list.find((c) => c.slug === slug)?.name ?? slug;
}

export function navCategories(list: SiteCategory[] = CATEGORIES): SiteCategory[] {
  return list
    .filter((c) => c.show_in_nav !== false && !c.parent_id)
    .sort((a, b) => (a.nav_order ?? 0) - (b.nav_order ?? 0));
}

export function articlePath(section: string, publicId: string) {
  return `/${section}/${publicId}`;
}
