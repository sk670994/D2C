/**
 * "Find ads by AI label": structured search over the labels Jev/Gemini put
 * on every ad (hook, angle, persona, language, emotion, visual style, offer).
 * Structured filters first, per the architecture: exact, cheap, indexable
 * (GIN on ad_creative_decodes.elements). Pure parsing here; tested.
 */
import { ELEMENTS, type ElementKey } from "./taxonomy";

export const FINDER_KEYS = ["hookType", "angle", "persona", "language", "emotion", "visualStyle"] as const satisfies readonly ElementKey[];
export type FinderKey = (typeof FINDER_KEYS)[number];

export type FinderQuery = {
  labels: Partial<Record<FinderKey, string>>;
  offer: boolean | null;
  pageId: string | null;
  watchedOnly: boolean;
  limit: number;
};

/** URL params -> a validated query. Unknown values are dropped, never passed to SQL. */
export function parseFinderQuery(params: URLSearchParams): FinderQuery {
  const labels: FinderQuery["labels"] = {};
  for (const key of FINDER_KEYS) {
    const value = params.get(key)?.trim().toLowerCase();
    if (value && (ELEMENTS[key] as readonly string[]).includes(value)) labels[key] = value;
  }
  const offerRaw = params.get("offer");
  const pageId = params.get("pageId")?.trim() ?? "";
  const limit = Number(params.get("limit"));
  return {
    labels,
    offer: offerRaw === "1" ? true : offerRaw === "0" ? false : null,
    pageId: /^\d{5,25}$/.test(pageId) ? pageId : null,
    watchedOnly: params.get("scope") === "watched",
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(60, Math.floor(limit)) : 24,
  };
}

/** The JSON the decode row must contain (jsonb @> containment). */
export function containmentFilter(q: FinderQuery): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { ...q.labels } as Record<string, string>;
  if (q.offer != null) out.offerPresent = q.offer;
  return out;
}

export function hasFilters(q: FinderQuery): boolean {
  return Object.keys(q.labels).length > 0 || q.offer != null;
}
