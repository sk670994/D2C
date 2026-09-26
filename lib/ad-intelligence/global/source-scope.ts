/**
 * Pure helpers for Meta's own result counts (unit tested in source-scope.test.ts).
 */

export type SourceScope = {
  scopeType: "page" | "keyword";
  scopeKey: string;
};

export type SourceStatusScope = "active" | "all";

export function normalizeKeywordScope(query: string): string {
  return query.toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Which Meta count a search can honestly be compared with.
 * - exact advertiser (Page ID)  -> that page's count
 * - keyword search              -> the keyword's count
 * - brand NAME without Page ID  -> null: Meta runs it as a keyword search, so
 *   its count covers every advertiser that mentions the word (e.g. "mars").
 */
export function sourceScopeFor(input: {
  mode: "advertiser" | "keyword";
  query: string;
  pageId?: string | null;
}): SourceScope | null {
  const pageId = String(input.pageId ?? "").trim();
  if (input.mode === "advertiser") {
    return /^\d+$/.test(pageId) ? { scopeType: "page", scopeKey: pageId } : null;
  }
  const key = normalizeKeywordScope(input.query);
  return key.length >= 2 ? { scopeType: "keyword", scopeKey: key } : null;
}

/** Quick runs read Meta with active_status=active; deep runs with "all". */
export function statusScopeForDepth(depth: "quick" | "deep"): SourceStatusScope {
  return depth === "deep" ? "all" : "active";
}

/** Share of Meta's count that is indexed, 0-100 (null when not comparable). */
export function coveragePercent(indexed: number, metaTotal: number | null | undefined): number | null {
  if (metaTotal == null || !Number.isFinite(metaTotal) || metaTotal <= 0) return null;
  if (!Number.isFinite(indexed) || indexed < 0) return null;
  return Math.min(100, Math.round((indexed / metaTotal) * 100));
}
