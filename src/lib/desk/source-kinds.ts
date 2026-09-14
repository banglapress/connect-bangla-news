export const SOURCE_KINDS = [
  { value: "news_agency", label: "News agency" },
  { value: "major_news", label: "Major news" },
  { value: "international", label: "International" },
  { value: "specialist", label: "Specialist" },
  { value: "other", label: "Other" },
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number]["value"];

export function sourceKindLabel(kind: string | null | undefined) {
  return SOURCE_KINDS.find((row) => row.value === kind)?.label || kind || "Other";
}
