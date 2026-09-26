/**
 * Server-side ad ordering. Whitelisted: the value is passed to SQL only as one
 * of these literals (see adspy_search_creatives_v5).
 *   relevant  active first, most recently seen first (default)
 *   newest    ad start date, newest first
 *   longest   observed running days (observed longevity, not profitability)
 *   stopped   inactive ads first, most recently stopped first
 */
export const AD_SORT_KEYS = ["relevant", "newest", "longest", "stopped"] as const;
export type AdSortKey = (typeof AD_SORT_KEYS)[number];

export function parseAdSort(value: string | null | undefined): AdSortKey {
  const v = (value ?? "").trim().toLowerCase();
  return (AD_SORT_KEYS as readonly string[]).includes(v) ? (v as AdSortKey) : "relevant";
}
