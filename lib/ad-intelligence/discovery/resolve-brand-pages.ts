/**
 * One resolver for "which Meta page(s) is this brand?" on the public pages
 * (brand page, industry/research stats). Order:
 *  1. seed `pages` pins in scripts/adspy-seed-brands.json (checked by hand;
 *     a brand can run several pages, e.g. Kapiva)
 *  2. PAGE_OVERRIDES below (hand-checked look-alike fixes)
 *  3. pickBrandPage over the autocomplete candidates (strict, same rules as
 *     the nightly collector)
 *  4. the older ranked prefix match, so brands that resolved before still do
 *
 * The core (resolveBrandPagesFrom) is pure and unit tested with injected
 * candidates. resolveBrandPages() fetches the candidates and THROWS on a
 * database error, so ISR pages keep their last good version instead of
 * caching an empty one.
 */
import seed from "@/scripts/adspy-seed-brands.json";

import { brandSlug } from "../brand-slug";
import { pickBrandPage, type RankedPageCandidate } from "./pick-page";

export type BrandPages = {
  primaryPageId: string;
  /** Primary first; more than one only for pinned multi-page brands. */
  pageIds: string[];
  /** Display name: the seed name for pinned brands, else the page name. */
  name: string;
  source: "pin" | "override" | "pick" | "ranked";
};

export type BrandPageCandidate = RankedPageCandidate & { pageId: string; label: string };

/** Checked by hand against the Ad Library (11 Oct): look-alike pages won. */
export const PAGE_OVERRIDES: Record<string, { pageId: string; name: string }> = {
  thewholetruth: { pageId: "108531977179455", name: "The Whole Truth Foods" },
};

type Seed = { brands: string[]; pages?: Record<string, string[]> };
const SEED = seed as Seed;

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The seed brand a name or slug refers to ("dot-and-key" -> "Dot & Key"), if any. */
export function seedBrandFor(nameOrSlug: string, brands: string[] = SEED.brands): string | null {
  const raw = String(nameOrSlug ?? "").trim();
  if (!raw) return null;
  const slug = brandSlug(raw);
  const n = norm(raw);
  return brands.find((b) => brandSlug(b) === slug) ?? brands.find((b) => norm(b) === n) ?? null;
}

function pinsFor(nameOrSlug: string, pins: Record<string, string[]>): { name: string; pageIds: string[] } | null {
  const slug = brandSlug(nameOrSlug);
  const n = norm(nameOrSlug);
  for (const [name, ids] of Object.entries(pins)) {
    if (brandSlug(name) !== slug && norm(name) !== n) continue;
    const pageIds = [...new Set((ids ?? []).map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id)))];
    if (pageIds.length) return { name, pageIds };
  }
  return null;
}

const SUFFIX = /^(s|foods?|india|in|inc|official|store|shop|co|company|brand|global|life|beauty|wellness|health|nutrition|ayurveda)?$/;

/** The older ranking: verified + exact first; a longer name only with a generic suffix, any prefix as last resort. */
function rankedPick(query: string, candidates: BrandPageCandidate[]): BrandPageCandidate | null {
  const want = norm(query);
  if (want.length < 2) return null;
  const verified = (c: BrandPageCandidate) => /verified/i.test(String(c.verification ?? "")) && !/not[_\s-]?verified|unverified/i.test(String(c.verification ?? ""));
  const reach = (c: BrandPageCandidate) => Number(c.likes ?? 0) + Number(c.igFollowers ?? 0);
  const rank = (c: BrandPageCandidate) => {
    const n = norm(c.label);
    if (!n.startsWith(want)) return -1;
    const exact = n === want;
    if (!exact && !SUFFIX.test(n.slice(want.length))) return -0.5;
    return (verified(c) ? 2 : 0) + (exact ? 1 : 0);
  };
  return (
    candidates
      .map((c) => ({ c, score: rank(c) }))
      .filter((x) => x.score > -1)
      .sort((a, b) => b.score - a.score || reach(b.c) - reach(a.c))[0]?.c ?? null
  );
}

/** Steps 1-2 only (no candidates needed). */
export function pinnedBrandPages(
  nameOrSlug: string,
  options: { pins?: Record<string, string[]>; overrides?: Record<string, { pageId: string; name: string }> } = {},
): BrandPages | null {
  const pins = pinsFor(nameOrSlug, options.pins ?? SEED.pages ?? {});
  if (pins) return { primaryPageId: pins.pageIds[0], pageIds: pins.pageIds, name: pins.name, source: "pin" };
  const override = (options.overrides ?? PAGE_OVERRIDES)[norm(nameOrSlug)];
  if (override) return { primaryPageId: override.pageId, pageIds: [override.pageId], name: override.name, source: "override" };
  return null;
}

/** Pure resolver: pins -> overrides -> pickBrandPage -> older ranked match. */
export function resolveBrandPagesFrom(
  nameOrSlug: string,
  candidates: BrandPageCandidate[],
  options: { pins?: Record<string, string[]>; overrides?: Record<string, { pageId: string; name: string }> } = {},
): BrandPages | null {
  const pinned = pinnedBrandPages(nameOrSlug, options);
  if (pinned) return pinned;
  const query = queryFor(nameOrSlug);
  if (norm(query).length < 2) return null;
  const valid = candidates.filter((c) => c.pageId && c.label);
  const picked = pickBrandPage(query, valid).page;
  if (picked) return { primaryPageId: String(picked.pageId), pageIds: [String(picked.pageId)], name: String(picked.label), source: "pick" };
  const ranked = rankedPick(query, valid);
  if (ranked) return { primaryPageId: String(ranked.pageId), pageIds: [String(ranked.pageId)], name: String(ranked.label), source: "ranked" };
  return null;
}

/** What to type into autocomplete: the seed name when known, else the slug as words. */
export function queryFor(nameOrSlug: string): string {
  const seedName = seedBrandFor(nameOrSlug);
  if (seedName) return seedName;
  return decodeURIComponent(String(nameOrSlug ?? ""))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

type AutocompleteRow = { page_id?: string | number | null; label?: string | null; verification?: string | null; likes?: number | null; ig_followers?: number | null };

/** Autocomplete candidates for a brand name. Throws on a database error. */
export async function fetchBrandPageCandidates(query: string, country = "IN"): Promise<BrandPageCandidate[]> {
  const { createGlobalServiceClient } = await import("@/lib/ad-intelligence/global/supabase");
  const { data, error } = await createGlobalServiceClient().rpc("adspy_autocomplete_advertisers", {
    p_query: query,
    p_platform: "meta",
    p_country: country,
    p_limit: 8,
  });
  if (error) throw new Error(`Brand page look-up failed: ${error.message}`);
  return ((data ?? []) as AutocompleteRow[])
    .filter((r) => r.page_id && r.label)
    .map((r) => ({
      pageId: String(r.page_id),
      label: String(r.label),
      verification: r.verification ?? null,
      likes: r.likes ?? null,
      igFollowers: r.ig_followers ?? null,
    }));
}

/**
 * Brand name or slug -> its Meta page(s). Pinned/overridden brands need no
 * query. Null = confirmed no match. Throws when the look-up itself fails.
 */
export async function resolveBrandPages(
  nameOrSlug: string,
  options: { country?: string; fetchCandidates?: (query: string) => Promise<BrandPageCandidate[]> } = {},
): Promise<BrandPages | null> {
  const pinned = pinnedBrandPages(nameOrSlug);
  if (pinned) return pinned;
  const query = queryFor(nameOrSlug);
  if (norm(query).length < 2) return null;
  const candidates = await (options.fetchCandidates ?? ((q) => fetchBrandPageCandidates(q, options.country ?? "IN")))(query);
  return resolveBrandPagesFrom(nameOrSlug, candidates);
}
