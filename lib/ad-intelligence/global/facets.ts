import "server-only";

import { createGlobalServiceClient } from "./supabase";

/**
 * Facet counts for the AdSpy results page ("Hindi · 124 ads").
 *
 * Uses the same matching rules as adspy_search_creatives_v4 (platform,
 * country market, exact Page ID or name/keyword match, language, region,
 * format, status). Each dimension is counted with every OTHER active filter
 * applied, so a count always equals the number of results the user gets by
 * clicking it.
 *
 * Runs over PostgREST (no new database function required). Counts are exact
 * up to MAX_ROWS matching creatives; beyond that `capped` is true.
 */

const PAGE = 1000;
const MAX_ROWS = 5000;

export type FacetInput = {
  query: string;
  country: string;
  platform: string;
  mode: "advertiser" | "keyword";
  pageId?: string;
  language?: string;
  region?: string;
  creativeType?: "video" | "image" | "carousel";
  activeStatus?: "active" | "inactive";
};

export type FacetBucket = { value: string; label: string; count: number };

export type FacetResult = {
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

type Row = {
  id: string;
  creative_type: string | null;
  is_currently_active: boolean | null;
  first_seen_at: string | null;
  markets: Array<{
    region: string | null;
    state_name: string | null;
    city_name: string | null;
    country_name: string | null;
  }> | null;
  languages: Array<{ language_code: string | null; language_name: string | null }> | null;
};

const KEYWORD_FIELDS = [
  "advertiser_name",
  "creator_name",
  "headline",
  "product_name",
  "primary_text",
  "description",
  "offer",
  "call_to_action",
  "landing_page_url",
];

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** PostgREST or() values cannot contain these reliably; drop them. */
function orSafe(value: string): string {
  return value.replace(/[,()"\\*%:]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchRows(input: FacetInput): Promise<{ rows: Row[]; capped: boolean }> {
  const client = createGlobalServiceClient();
  const query = input.query.trim();
  const rows: Row[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let request = client
      .from("ad_intelligence_creatives")
      .select(
        "id,creative_type,is_currently_active,first_seen_at," +
          "markets:ad_intelligence_markets!inner(country,region,state_name,city_name,country_name)," +
          "languages:ad_intelligence_languages(language_code,language_name)",
      )
      .eq("platform", input.platform.toLowerCase())
      .eq("markets.country", input.country.toUpperCase());

    if (input.pageId) {
      request = request.eq("advertiser_id", input.pageId);
    } else if (input.mode === "keyword") {
      const safe = orSafe(query);
      if (!safe) return { rows: [], capped: false };
      request = request.or(KEYWORD_FIELDS.map((field) => `${field}.ilike.*${safe}*`).join(","));
    } else {
      request = request.ilike("advertiser_name", `%${likeEscape(query)}%`);
    }

    const { data, error } = await request.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Facet query failed: ${error.message}`);

    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) return { rows, capped: false };
  }

  return { rows, capped: true };
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesLanguage(row: Row, language: string): boolean {
  if (!language) return true;
  return (row.languages ?? []).some(
    (l) => norm(l.language_code) === language || norm(l.language_name) === language,
  );
}

function matchesRegion(row: Row, region: string): boolean {
  if (!region) return true;
  return (row.markets ?? []).some((m) =>
    [m.region, m.state_name, m.city_name, m.country_name].some((v) => norm(v).includes(region)),
  );
}

function matchesFormat(row: Row, format: string): boolean {
  return !format || norm(row.creative_type) === format;
}

function matchesStatus(row: Row, status: string): boolean {
  if (!status) return true;
  if (status === "active") return row.is_currently_active === true;
  if (status === "inactive") return row.is_currently_active === false;
  return true;
}

type Dim = "language" | "region" | "format" | "status";

function passes(row: Row, input: FacetInput, except?: Dim): boolean {
  return (
    (except === "language" || matchesLanguage(row, norm(input.language))) &&
    (except === "region" || matchesRegion(row, norm(input.region))) &&
    (except === "format" || matchesFormat(row, norm(input.creativeType))) &&
    (except === "status" || matchesStatus(row, norm(input.activeStatus)))
  );
}

function bump(map: Map<string, FacetBucket>, value: string, label: string) {
  const current = map.get(value);
  if (current) current.count += 1;
  else map.set(value, { value, label, count: 1 });
}

function sorted(map: Map<string, FacetBucket>, limit = 50): FacetBucket[] {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  hinglish: "Hinglish",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  or: "Odia",
  ur: "Urdu",
  as: "Assamese",
};

function weekStartUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export async function getSearchFacets(input: FacetInput): Promise<FacetResult> {
  const { rows, capped } = await fetchRows(input);

  const status = new Map<string, FacetBucket>();
  const format = new Map<string, FacetBucket>();
  const language = new Map<string, FacetBucket>();
  const region = new Map<string, FacetBucket>();

  let total = 0;
  const now = Date.now();
  const WEEKS = 12;
  const thisWeek = weekStartUtc(new Date(now)).getTime();
  const weekCounts = new Array<number>(WEEKS).fill(0);
  let launched7d = 0;
  let launched30d = 0;
  let datedCreatives = 0;

  for (const row of rows) {
    if (passes(row, input)) {
      total += 1;
      const first = row.first_seen_at ? new Date(row.first_seen_at).getTime() : NaN;
      if (Number.isFinite(first)) {
        datedCreatives += 1;
        const age = now - first;
        if (age <= 7 * 86_400_000) launched7d += 1;
        if (age <= 30 * 86_400_000) launched30d += 1;
        const index = Math.floor((thisWeek - weekStartUtc(new Date(first)).getTime()) / (7 * 86_400_000));
        if (index >= 0 && index < WEEKS) weekCounts[WEEKS - 1 - index] += 1;
      }
    }

    if (passes(row, input, "status")) {
      if (row.is_currently_active === true) bump(status, "active", "Active");
      else if (row.is_currently_active === false) bump(status, "inactive", "Inactive");
    }

    if (passes(row, input, "format")) {
      const value = norm(row.creative_type) || "unknown";
      if (value !== "unknown") bump(format, value, titleCase(value));
    }

    if (passes(row, input, "language")) {
      const seen = new Set<string>();
      for (const l of row.languages ?? []) {
        const code = norm(l.language_code);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        bump(language, code, l.language_name?.trim() || LANGUAGE_NAMES[code] || code.toUpperCase());
      }
    }

    if (passes(row, input, "region")) {
      const seen = new Set<string>();
      for (const m of row.markets ?? []) {
        const label = (m.state_name || m.region || m.city_name || "").trim();
        const key = norm(label);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        bump(region, key, label);
      }
    }
  }

  const weeks = weekCounts.map((launched, i) => ({
    weekStart: new Date(thisWeek - (WEEKS - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10),
    launched,
  }));

  return {
    total,
    capped,
    status: sorted(status),
    format: sorted(format),
    language: sorted(language),
    region: sorted(region, 20),
    momentum: { weeks, launched7d, launched30d, datedCreatives },
  };
}
