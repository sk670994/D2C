import type { MetaPageSearchOutcome } from "@/lib/ad-intelligence/global/meta-page-search";

export const SCRAPECREATORS_PAGE_SEARCH_ENDPOINT = "https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies";
const DEFAULT_TIMEOUT_MS = 5_000;
const POSITIVE_TTL_MS = 60_000;
const EMPTY_TTL_MS = 20_000;
const MAX_CACHE_ENTRIES = 500;
const MAX_RESULTS = 12;

type ProviderPage = {
  page_id?: string | number | null;
  name?: string | null;
  category?: string | null;
  image_uri?: string | null;
  likes?: number | null;
  verification?: string | null;
  country?: string | null;
  entity_type?: string | null;
  ig_username?: string | null;
  ig_followers?: number | null;
  ig_verification?: boolean | null;
  page_alias?: string | null;
  page_is_deleted?: boolean | null;
};

type ProviderResponse = {
  success?: boolean;
  credits_remaining?: number | null;
  credits_charged?: number | null;
  searchResults?: ProviderPage[] | null;
  error?: string | null;
  message?: string | null;
};

type Candidate = MetaPageSearchOutcome["pages"][number];
type CacheEntry = { expiresAt: number; pages: Candidate[] };
const cache = new Map<string, CacheEntry>();

/**
 * Prefer the existing ScrapeCreators integration whenever its server key is
 * present. Set ZOOPLENS_META_PAGE_SEARCH_PROVIDER=off to disable just live
 * Page discovery; set it to scrapecreators to enable explicitly.
 */
export function isScrapeCreatorsPageSearchEnabled(): boolean {
  const choice = process.env.ZOOPLENS_META_PAGE_SEARCH_PROVIDER?.trim().toLowerCase();
  if (choice === "off" || choice === "disabled") return false;
  if (choice === "scrapecreators") return Boolean(process.env.SCRAPECREATORS_API_KEY?.trim());
  if (choice && choice !== "auto") return false;
  return Boolean(process.env.SCRAPECREATORS_API_KEY?.trim());
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function relevanceScore(name: string, query: string): number {
  const n = normalize(name);
  const q = normalize(query);
  if (!n || !q) return -1;
  if (n === q) return 10_000;
  if (n.startsWith(q)) return 9_000 - Math.max(0, n.length - q.length);
  const index = n.indexOf(q);
  if (index >= 0) return 7_000 - index;
  const tokens = q.split(" ").filter(Boolean);
  return tokens.length && tokens.every((token) => n.includes(token))
    ? 5_000 - Math.max(0, n.length - q.length)
    : -1;
}

function mapPage(row: ProviderPage, query: string): Candidate | null {
  const pageId = String(row.page_id ?? "").trim();
  const name = String(row.name ?? "").replace(/\s+/g, " ").trim();
  if (!/^\d+$/.test(pageId) || !name || row.page_is_deleted === true || relevanceScore(name, query) < 0) return null;
  return {
    pageId,
    name,
    category: typeof row.category === "string" ? row.category : null,
    imageUrl: typeof row.image_uri === "string" ? row.image_uri : null,
    verification: typeof row.verification === "string" ? row.verification : null,
    entityType: typeof row.entity_type === "string" ? row.entity_type : null,
    igUsername: typeof row.ig_username === "string" ? row.ig_username : null,
    pageAlias: typeof row.page_alias === "string" ? row.page_alias : null,
    likes: typeof row.likes === "number" && Number.isFinite(row.likes) ? row.likes : null,
    igFollowers: typeof row.ig_followers === "number" && Number.isFinite(row.ig_followers) ? row.ig_followers : null,
  };
}

function cacheKey(query: string): string {
  // The ScrapeCreators Search for Companies endpoint documents query only;
  // its returned Pages are global. Country is applied to ad collection later.
  return normalize(query);
}

function outcome(pages: Candidate[], status: "found" | "no_match" | "timeout" | "error", startedAt: number, message: string): MetaPageSearchOutcome {
  return { pages, status, message, durationMs: Math.max(0, Date.now() - startedAt) };
}

function setCache(key: string, pages: Candidate[]): void {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + (pages.length ? POSITIVE_TTL_MS : EMPTY_TTL_MS), pages });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Dedicated ScrapeCreators Page discovery; distinct from searching ads. */
export async function scrapeCreatorsMetaPageSearch(
  query: string,
  country = "IN",
  options: { apiKey?: string; timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<MetaPageSearchOutcome> {
  const startedAt = Date.now();
  const cleanQuery = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  // Company discovery is global on this provider; the selected country is used by the subsequent ad-search/collection call.
  void country;
  if (cleanQuery.length < 2) return outcome([], "no_match", startedAt, "Enter at least two characters to search for a Meta page.");
  if (options.signal?.aborted) return outcome([], "error", startedAt, "The lookup was cancelled.");

  const apiKey = (options.apiKey ?? process.env.SCRAPECREATORS_API_KEY ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return outcome([], "error", startedAt, "ScrapeCreators Page search is not configured.");

  // Avoid cache contamination in tests/custom transports. Production uses the
  // shared per-process cache to reduce repeated provider calls/credits.
  const useCache = !options.fetchImpl;
  const key = cacheKey(cleanQuery);
  if (useCache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      cache.delete(key);
      cache.set(key, hit);
      return outcome(hit.pages, hit.pages.length ? "found" : "no_match", startedAt,
        hit.pages.length ? "Found public Meta page matches." : "No matching public Meta pages were returned.");
    }
    if (hit) cache.delete(key);
  }

  const url = new URL(SCRAPECREATORS_PAGE_SEARCH_ENDPOINT);
  url.searchParams.set("query", cleanQuery);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(500, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(url, {
        method: "GET",
        headers: { Accept: "application/json", "x-api-key": apiKey },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      if (timedOut) return outcome([], "timeout", startedAt, "ScrapeCreators Page search timed out. Existing indexed suggestions remain available.");
      if (options.signal?.aborted) return outcome([], "error", startedAt, "The lookup was cancelled.");
      return outcome([], "error", startedAt, "ScrapeCreators Page search is temporarily unavailable.");
    }

    if (!response.ok) {
      console.warn("[ADSPY_PAGE_SEARCH_PROVIDER] ScrapeCreators non-success status", { status: response.status, queryLength: cleanQuery.length });
      return outcome([], response.status === 408 || response.status === 504 ? "timeout" : "error", startedAt,
        "ScrapeCreators Page search did not complete successfully. Existing indexed suggestions remain available.");
    }

    let json: ProviderResponse;
    try {
      json = (await response.json()) as ProviderResponse;
    } catch {
      return outcome([], "error", startedAt, "ScrapeCreators Page search returned unreadable data. Existing indexed suggestions remain available.");
    }
    if (json.success === false || !Array.isArray(json.searchResults)) {
      console.warn("[ADSPY_PAGE_SEARCH_PROVIDER] ScrapeCreators unexpected response", { queryLength: cleanQuery.length, success: json.success ?? null, hasSearchResults: Array.isArray(json.searchResults) });
      return outcome([], "error", startedAt, "ScrapeCreators Page search returned an unexpected response. Existing indexed suggestions remain available.");
    }

    const byPageId = new Map<string, Candidate>();
    for (const row of json.searchResults) {
      if (!row || typeof row !== "object") continue;
      const page = mapPage(row, cleanQuery);
      if (page && !byPageId.has(page.pageId)) byPageId.set(page.pageId, page);
    }
    // Same-name pages remain selectable: dedupe only by numeric Page ID.
    const pages = [...byPageId.values()]
      .sort((a, b) => relevanceScore(b.name, cleanQuery) - relevanceScore(a.name, cleanQuery) || a.name.localeCompare(b.name))
      .slice(0, MAX_RESULTS);
    if (useCache) setCache(key, pages);
    const creditInfo = typeof json.credits_charged === "number" ? ` Provider charged ${json.credits_charged} credit(s).` : "";
    return outcome(pages, pages.length ? "found" : "no_match", startedAt,
      pages.length ? `Found public Meta page matches.${creditInfo}` : `The provider returned no relevant public Meta Pages.${creditInfo}`);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
