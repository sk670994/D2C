/**
 * Decide whether a typed brand name identifies exactly ONE Meta page.
 * Pure; unit tested in pick-page.test.ts. Used by the collector (to scrape a
 * page instead of a keyword) and by the AdSpy search box (to auto-lock).
 *
 * Rules (never guess):
 *  1. exactly one page whose name equals the query (ignoring case, spaces,
 *     punctuation) -> that page
 *  2. otherwise exactly one VERIFIED page whose name starts with the query
 *     (e.g. "mars" -> "MARS Cosmetics") -> that page
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
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isVerified(value: string | null | undefined): boolean {
  return /verified/i.test(String(value ?? "")) && !/not[_\s-]?verified|unverified/i.test(String(value ?? ""));
}

export function pickExactPage<T extends PageCandidate>(query: string, candidates: T[]): T | null {
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

  const verifiedPrefix = byPage(valid.filter((c) => isVerified(c.verification) && compactBrand(c.label).startsWith(q)));
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
