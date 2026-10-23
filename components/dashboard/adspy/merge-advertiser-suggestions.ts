import type { AutocompleteAdvertiser } from "./adspy-types";

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function compact(value: string): string {
  return normalize(value).replace(/\s+/g, "");
}
function matchesQuery(item: AutocompleteAdvertiser, query: string): boolean {
  const q = normalize(query);
  if (!q) return item.source !== "meta_public";
  const label = normalize(item.label);
  const domain = normalize(item.domain ?? "");
  const cq = compact(query);
  return label.includes(q) || domain.includes(q) || (cq.length >= 2 && (compact(item.label).includes(cq) || compact(item.domain ?? "").includes(cq)));
}
function realPage(item: AutocompleteAdvertiser): boolean {
  return /^\d+$/.test(String(item.pageId ?? "").trim());
}

/**
 * Preserve indexed suggestions as the fast first response, then append live-only pages.
 * Merge metadata by numeric Page ID, not name; same-name Pages with different IDs survive.
 * Placeholder popular brands are fallback-only and never mask a real Meta page.
 */
export function mergeAdvertiserSuggestions(
  indexed: AutocompleteAdvertiser[],
  live: AutocompleteAdvertiser[],
  query: string,
  limit = 12,
): AutocompleteAdvertiser[] {
  const q = query.trim();
  const filteredIndexed = indexed.filter((item) => matchesQuery(item, q));
  const filteredLive = q.length >= 2
    ? live.filter((item) => realPage(item) && matchesQuery(item, q))
    : [];
  const liveById = new Map<string, AutocompleteAdvertiser>();
  for (const item of filteredLive) liveById.set(String(item.pageId), item);
  const indexedIds = new Set<string>();
  const output: AutocompleteAdvertiser[] = [];
  const labelsWithRealPages = new Set(filteredLive.map((item) => normalize(item.label)));
  const hasRealCandidate = filteredIndexed.some(realPage) || filteredLive.length > 0;

  for (const item of filteredIndexed) {
    if (!realPage(item)) {
      // Popular-brand placeholders are only a fallback when neither source has a page ID.
      if (!hasRealCandidate && !labelsWithRealPages.has(normalize(item.label))) output.push(item);
      continue;
    }
    const id = String(item.pageId);
    if (indexedIds.has(id)) continue;
    indexedIds.add(id);
    const liveMatch = liveById.get(id);
    if (!liveMatch) {
      output.push(item);
      continue;
    }
    output.push({
      ...item,
      ...liveMatch,
      // A missing live field should not erase useful indexed metadata.
      label: liveMatch.label || item.label,
      domain: liveMatch.domain ?? item.domain ?? null,
      profileUrl: liveMatch.profileUrl ?? item.profileUrl ?? null,
      profileImageUrl: liveMatch.profileImageUrl ?? item.profileImageUrl ?? null,
      category: liveMatch.category ?? item.category ?? null,
      verification: liveMatch.verification ?? item.verification ?? null,
      likes: liveMatch.likes ?? item.likes ?? null,
      igFollowers: liveMatch.igFollowers ?? item.igFollowers ?? null,
      source: "meta_public",
    });
  }

  const emittedIds = new Set(output.filter(realPage).map((item) => String(item.pageId)));
  for (const item of filteredLive) {
    const id = String(item.pageId);
    if (emittedIds.has(id)) continue;
    emittedIds.add(id);
    output.push(item);
  }

  // Keep same-name numeric Page IDs distinct. Only exact duplicate IDs are collapsed.
  return output.slice(0, Math.max(0, limit));
}
