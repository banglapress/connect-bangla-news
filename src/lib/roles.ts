export const ROLE_OPTIONS = [
  { value: "admin", label: "অ্যাডমিন" },
  { value: "news_editor", label: "নিউজ এডিটর" },
  { value: "sub_editor", label: "সাব-এডিটর" },
  { value: "reporter", label: "রিপোর্টার" },
  { value: "subscriber", label: "সাবস্ক্রাইবার" },
  { value: "none", label: "কোনো ভূমিকা নেই" },
] as const;

export const STAFF_ROLES = ["admin", "editor", "news_editor", "sub_editor", "reporter"] as const;

export function isStaffRole(roles: string[]) {
  return roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
}

export function roleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}
