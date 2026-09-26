import type { Ad } from "./adspy-types";

export type StatusFilter = "" | "active" | "inactive";
export type FormatFilter = "" | "video" | "image" | "carousel";

export type Filters = {
  status: StatusFilter;
  format: FormatFilter;
  language: string;
  region: string;
};

/** Must match AD_SORT_KEYS in lib/ad-intelligence/global/accurate-search.ts. */
export type SortKey = "relevant" | "newest" | "longest" | "stopped";
export const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["relevant", "Active first"],
  ["newest", "Newest launched"],
  ["longest", "Longest running"],
  ["stopped", "Recently stopped"],
];

export const NO_FILTERS: Filters = { status: "", format: "", language: "", region: "" };

export type FacetBucket = { value: string; label: string; count: number };

export type Facets = {
  total: number;
  capped: boolean;
  status: FacetBucket[];
  format: FacetBucket[];
  language: FacetBucket[];
  region: FacetBucket[];
  momentum: {
    weeks: Array<{ weekStart: string; launched: number }>;
    launched7d: number;
    launched30d: number;
    datedCreatives: number;
  };
};

export type SearchTarget = {
  query: string;
  pageId: string | null;
  mode: "advertiser" | "keyword";
  country: string;
  avatar?: string | null;
};

export function activeFilterCount(filters: Filters): number {
  return [filters.status, filters.format, filters.language, filters.region].filter(Boolean).length;
}

export function applyFilterParams(url: URL, filters: Filters) {
  if (filters.status) url.searchParams.set("activeStatus", filters.status);
  if (filters.format) url.searchParams.set("creativeType", filters.format);
  if (filters.language) url.searchParams.set("language", filters.language);
  if (filters.region) url.searchParams.set("region", filters.region);
}

export function applyTargetParams(url: URL, target: SearchTarget) {
  url.searchParams.set("q", target.query);
  url.searchParams.set("country", target.country);
  url.searchParams.set("mode", target.mode);
  if (target.pageId && target.mode === "advertiser") url.searchParams.set("pageId", target.pageId);
}

export function stateKey(target: SearchTarget | null, filters: Filters, page: number): string {
  if (!target) return "";
  return [
    target.query.trim().toLowerCase(),
    target.country,
    target.mode,
    target.pageId ?? "",
    filters.status,
    filters.format,
    filters.language.toLowerCase(),
    filters.region.toLowerCase(),
    page,
  ].join("|");
}

/* ---------------------------- URL persistence ---------------------------- */

export function readUrlState(): { target: SearchTarget | null; filters: Filters; page: number } {
  if (typeof window === "undefined") return { target: null, filters: NO_FILTERS, page: 1 };
  const p = new URLSearchParams(window.location.search);
  const query = (p.get("q") ?? "").trim();
  const countryRaw = (p.get("country") ?? "IN").toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "IN";
  const mode = p.get("mode") === "keyword" ? "keyword" : "advertiser";
  const pid = (p.get("pid") ?? "").trim();
  const status = p.get("status");
  const format = p.get("format");
  const page = Math.max(1, Math.floor(Number(p.get("page") ?? 1)) || 1);
  return {
    target:
      query.length >= 2
        ? { query, country, mode, pageId: mode === "advertiser" && /^\d+$/.test(pid) ? pid : null }
        : null,
    filters: {
      status: status === "active" || status === "inactive" ? status : "",
      format: format === "video" || format === "image" || format === "carousel" ? format : "",
      language: (p.get("lang") ?? "").slice(0, 32),
      region: (p.get("region") ?? "").slice(0, 100),
    },
    page,
  };
}

export function writeUrlState(target: SearchTarget | null, filters: Filters, page: number) {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams();
  if (target) {
    p.set("q", target.query);
    if (target.country !== "IN") p.set("country", target.country);
    if (target.mode === "keyword") p.set("mode", "keyword");
    if (target.pageId) p.set("pid", target.pageId);
    if (filters.status) p.set("status", filters.status);
    if (filters.format) p.set("format", filters.format);
    if (filters.language) p.set("lang", filters.language);
    if (filters.region) p.set("region", filters.region);
    if (page > 1) p.set("page", String(page));
  }
  const next = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/* ------------------------------ Recent search ----------------------------- */

const RECENT_KEY = "zooptrack.adspy.recent.v1";

export type RecentItem = { label: string; pageId: string | null; country: string; avatar?: string | null };

export function readRecent(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.label === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem) {
  try {
    const list = readRecent().filter(
      (r) => !(r.label.toLowerCase() === item.label.toLowerCase() && r.pageId === item.pageId && r.country === item.country),
    );
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...list].slice(0, 8)));
  } catch {
    // Storage unavailable (private mode) — recents are a convenience only.
  }
}

/* -------------------------------- Formatting ------------------------------ */

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatCompact(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatInt(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return Math.round(value).toLocaleString("en-IN");
}

export function labelize(value?: string | null): string {
  return String(value ?? "unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function domainOf(value?: string | null): string | null {
  const url = safeExternalUrl(value);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The opening line of the ad copy — what a viewer reads first. */
export function hookOf(ad: Ad): string | null {
  const text = (ad.primaryText ?? "").replace(/\s+/g, " ").trim();
  // Meta Ad Library UI text sometimes lands in the copy field; it is not a hook.
  if (!text || /^started running on\b/i.test(text)) return null;
  const firstSentence = text.split(/(?<=[.!?।])\s/)[0] ?? text;
  const hook = firstSentence.length >= 25 ? firstSentence : text;
  return hook.length > 180 ? `${hook.slice(0, 177).trimEnd()}…` : hook;
}

export function runningLabel(ad: Ad): string | null {
  const days = Number(ad.runningDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days >= 365) return `${Math.floor(days / 365)}y ${Math.round((days % 365) / 30)}m running`;
  if (days >= 60) return `${Math.round(days / 30)} months running`;
  return `${days} day${days === 1 ? "" : "s"} running`;
}

export function statusLabel(ad: Ad): { label: string; tone: "active" | "inactive" | "unknown" } {
  if (ad.isActive === true) return { label: "Active", tone: "active" };
  if (ad.isActive === false) return { label: "Inactive", tone: "inactive" };
  return { label: "Status unknown", tone: "unknown" };
}

export function provenanceOf(ad: Ad, field: string): string | null {
  const value = (ad.dataProvenance ?? {})[field];
  return typeof value === "string" ? value : null;
}
