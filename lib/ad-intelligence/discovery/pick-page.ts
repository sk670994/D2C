/**
 * Decide whether a typed brand name identifies exactly ONE Meta page.
 * Pure; unit tested in pick-page.test.ts. Used by the collector (to scrape a
 * page instead of a keyword) and by the AdSpy search box (to auto-lock).
 *
 * Rules (never guess):
 *  1. exactly one page whose name equals the query (ignoring case, spaces,
 *     punctuation) -> that page
 *  2. otherwise, among pages whose name starts with the query: exactly one
 *     such page (verified or not, e.g. "deconstruct" -> "Deconstruct
 *     Skincare") -> that page; several -> the single VERIFIED one
 *     (e.g. "mars" -> "MARS Cosmetics" over "Mars Cafe")
 *  3. anything else (none, or ambiguous) -> null
 */
export type PageCandidate = {
  pageId: string | number | null | undefined;
  label: string | null | undefined;
  verification?: string | null;
};

export function compactBrand(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isVerified(value: string | null | undefined): boolean {
  return /verified/i.test(String(value ?? "")) && !/not[_\s-]?verified|unverified/i.test(String(value ?? ""));
}

export function pickExactPage<T extends PageCandidate>(
  query: string,
  candidates: T[],
  options: { verifiedPrefixOnly?: boolean } = {},
): T | null {
  const q = compactBrand(query);
  if (q.length < 2) return null;
  const valid = candidates.filter((c) => /^\d+$/.test(String(c.pageId ?? "").trim()) && compactBrand(c.label));
  const byPage = (list: T[]) => {
    const unique = new Map<string, T>();
    for (const item of list) {
      const id = String(item.pageId).trim();
      if (!unique.has(id)) unique.set(id, item);
    }
    return Array.from(unique.values());
  };

  const exact = byPage(valid.filter((c) => compactBrand(c.label) === q));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const prefix = byPage(valid.filter((c) => compactBrand(c.label).startsWith(q)));
  if (prefix.length === 1 && !options.verifiedPrefixOnly) return prefix[0];
  // Same page listed twice (once verified, once not) counts as verified.
  const verifiedIds = new Set(valid.filter((c) => isVerified(c.verification)).map((c) => String(c.pageId).trim()));
  const verifiedPrefix = prefix.filter((c) => verifiedIds.has(String(c.pageId).trim()));
  return verifiedPrefix.length === 1 ? verifiedPrefix[0] : null;
}

/** Candidates worth offering when no single page could be picked. */
export function pageChoices<T extends PageCandidate>(query: string, candidates: T[], limit = 4): T[] {
  const q = compactBrand(query);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    const id = String(c.pageId ?? "").trim();
    if (!/^\d+$/.test(id) || seen.has(id) || !compactBrand(c.label).includes(q)) continue;
    seen.add(id);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export type RankedPageCandidate = PageCandidate & { likes?: number | null; igFollowers?: number | null };

/**
 * Nightly seed matching: pickExactPage first (strict: only a VERIFIED page
 * may match by prefix, since seed names come from lists, not from a user
 * looking at autocomplete); when that finds nothing or is
 * ambiguous, rank the plausible pages (same name, or verified and containing
 * the brand) and accept the top one only with a clear lead:
 *  - it is verified and no other plausible page is, or
 *  - verification ties and its audience (likes + IG followers) is >= 10x the
 *    runner-up's (both known).
 * Otherwise null, plus the candidates so a human can pin the right Page ID.
 */
export function pickBrandPage<T extends RankedPageCandidate>(
  query: string,
  candidates: T[],
): { page: T | null; candidates: T[]; reason: "exact" | "only_plausible" | "clear_lead" | "ambiguous" | "none" } {
  const exact = pickExactPage(query, candidates, { verifiedPrefixOnly: true });
  if (exact) return { page: exact, candidates: [exact], reason: "exact" };
  const q = compactBrand(query);
  if (q.length < 2) return { page: null, candidates: [], reason: "none" };

  const unique = new Map<string, T>();
  for (const c of candidates) {
    const id = String(c.pageId ?? "").trim();
    const name = compactBrand(c.label);
    if (!/^\d+$/.test(id) || !name || unique.has(id)) continue;
    if (name === q || (isVerified(c.verification) && name.includes(q))) unique.set(id, c);
  }
  const plausible = Array.from(unique.values());
  if (!plausible.length) return { page: null, candidates: [], reason: "none" };
  if (plausible.length === 1) return { page: plausible[0], candidates: plausible, reason: "only_plausible" };

  const audience = (c: T) => {
    const a = Number(c.likes ?? 0) + Number(c.igFollowers ?? 0);
    return Number.isFinite(a) && a > 0 ? a : 0;
  };
  const ranked = plausible.sort(
    (a, b) => Number(isVerified(b.verification)) - Number(isVerified(a.verification)) || audience(b) - audience(a),
  );
  const [top, second] = ranked;
  const topVerified = isVerified(top.verification);
  const secondVerified = isVerified(second.verification);
  if (topVerified && !secondVerified) return { page: top, candidates: ranked, reason: "clear_lead" };
  if (topVerified === secondVerified && audience(second) > 0 && audience(top) >= 10 * audience(second)) {
    return { page: top, candidates: ranked, reason: "clear_lead" };
  }
  return { page: null, candidates: ranked.slice(0, 3), reason: "ambiguous" };
}
