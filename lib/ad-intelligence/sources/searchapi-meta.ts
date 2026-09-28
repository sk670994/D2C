/**
 * SearchApi.io as a Meta Ad Library source.
 *
 * SearchApi returns the same ad node shape Meta's own Ad Library JSON uses
 * (ad_archive_id, page_id, is_active, snapshot{body,cards,images,videos}...),
 * so every ad goes through the same mapper as our Playwright collector
 * (meta/node-to-ad.ts). Differences handled here: ISO dates instead of unix
 * seconds, a page token instead of Meta's GraphQL cursor, and billing per call.
 *
 * Runs anywhere fetch works (Vercel, scripts). No browser, no proxy.
 * Docs: https://www.searchapi.io/docs/meta-ad-library-api
 */
import type { AdSearchInput } from "../provider";
import type { CompetitorAd } from "../types";
import type { MetaLibraryNode, MetaLibrarySnapshot } from "../meta/library-json";
import { libraryNodeToAd } from "../meta/node-to-ad";

export const SEARCHAPI_ENDPOINT = "https://www.searchapi.io/api/v1/search";

/** One ad as SearchApi returns it (dates are ISO strings, not unix seconds). */
export type SearchApiMetaAd = Omit<MetaLibraryNode, "start_date" | "end_date"> & {
  start_date?: string | number | null;
  end_date?: string | number | null;
  snapshot?: MetaLibrarySnapshot | null;
};

export type SearchApiMetaResponse = {
  search_information?: { total_results?: number | null } | null;
  ads?: SearchApiMetaAd[] | null;
  pagination?: { next_page_token?: string | null } | null;
  error?: string | null;
};

export type SearchApiPage = {
  ads: SearchApiMetaAd[];
  totalResults: number | null;
  nextPageToken: string | null;
  ms: number;
};

export class SearchApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SearchApiError";
  }
}

export function searchApiKey(): string | null {
  const raw = process.env.SEARCHAPI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return raw ? raw : null;
}

/** ISO string, unix seconds or unix ms -> unix seconds (what the mapper expects). */
export function toUnixSeconds(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (/^\d+$/.test(value)) return toUnixSeconds(Number(value));
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** SearchApi ad -> Meta Ad Library node (the shape our mapper reads). */
export function toLibraryNode(ad: SearchApiMetaAd): MetaLibraryNode {
  return {
    ...ad,
    start_date: toUnixSeconds(ad.start_date),
    end_date: toUnixSeconds(ad.end_date),
  };
}

/**
 * Request body for one page. Exact page ID when we have it; otherwise a
 * keyword search (a brand name is a keyword on Meta, see AdSpy name search).
 */
export function searchApiRequestBody(
  input: Pick<AdSearchInput, "query" | "country" | "mode" | "advertiserPageId">,
  options: { activeStatus?: "active" | "inactive" | "all"; nextPageToken?: string | null } = {},
): Record<string, string> {
  const body: Record<string, string> = {
    engine: "meta_ad_library",
    country: (input.country ?? "IN").trim().toUpperCase() || "IN",
    active_status: options.activeStatus ?? "all",
    ad_type: "all",
    media_type: "all",
    sort_by: "most_recent",
  };
  const pageId = input.advertiserPageId?.trim();
  if (pageId) body.page_id = pageId;
  else {
    body.q = input.query.trim();
    body.search_type = "keyword_unordered";
  }
  if (options.nextPageToken) body.next_page_token = options.nextPageToken;
  return body;
}

/** One SearchApi call. POST + JSON body so long page tokens never hit URL limits. */
export async function fetchSearchApiPage(
  body: Record<string, string>,
  options: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<SearchApiPage> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(SEARCHAPI_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new SearchApiError(aborted ? "SearchApi timed out" : `SearchApi unreachable: ${error instanceof Error ? error.message : String(error)}`, null, true);
  } finally {
    clearTimeout(timer);
  }

  let json: SearchApiMetaResponse | null = null;
  try {
    json = (await response.json()) as SearchApiMetaResponse;
  } catch {
    json = null;
  }
  if (!response.ok || json?.error) {
    const status = response.status;
    const message = json?.error || `HTTP ${status}`;
    // 401/403: bad key or plan; 400: bad request. Retrying won't help.
    const retryable = status === 429 || status >= 500 || status === 0;
    throw new SearchApiError(`SearchApi: ${message}`, status, retryable);
  }
  const total = Number(json?.search_information?.total_results);
  return {
    ads: Array.isArray(json?.ads) ? json!.ads!.filter(Boolean) : [],
    totalResults: Number.isFinite(total) && total >= 0 ? total : null,
    nextPageToken: json?.pagination?.next_page_token || null,
    ms: Date.now() - started,
  };
}

export type SearchApiCollectInput = AdSearchInput & {
  deadlineAt: number;
  /** "all" for a full collection, "active" for a lighter refresh. */
  activeStatus?: "active" | "inactive" | "all";
  /** Hard cap on billed calls for one collection. */
  maxPages?: number;
  /**
   * Incremental refresh: stop after this many consecutive pages that bring
   * no ad we don't already hold (results are newest first).
   */
  stopAfterKnownPages?: number;
  isKnown?: (adId: string) => boolean;
};

export type SearchApiCollectResult = {
  calls: number;
  ads: number;
  totalResults: number | null;
  stoppedBy: "exhausted" | "deadline" | "max_pages" | "caught_up";
  ms: number;
};

export function sourceUrlFor(input: Pick<AdSearchInput, "query" | "country" | "advertiserPageId">): string {
  const country = (input.country ?? "IN").toUpperCase();
  return input.advertiserPageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&view_all_page_id=${input.advertiserPageId}`
    : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(input.query)}&search_type=keyword_unordered`;
}

/**
 * Pages through SearchApi, mapping each page to CompetitorAd and handing it to
 * onBatch (same contract as collectMetaAdsInBatches). Every ad carries
 * metadata.metaTotalCount so the app keeps its "Meta shows N" check.
 */
export async function collectMetaAdsViaSearchApi(
  input: SearchApiCollectInput,
  onBatch: (ads: CompetitorAd[]) => Promise<void> | void,
  options: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
    /** Another provider's page fetcher (e.g. ScrapeCreators); same loop, same mapper. */
    fetchPage?: (token: string | null, timeoutMs: number) => Promise<SearchApiPage>;
    provider?: string;
  } = {},
): Promise<SearchApiCollectResult> {
  const provider = options.provider ?? "searchapi";
  let fetchPage = options.fetchPage;
  if (!fetchPage) {
    const apiKey = options.apiKey ?? searchApiKey();
    if (!apiKey) throw new SearchApiError("SEARCHAPI_API_KEY is not set", null, false);
    fetchPage = (token, timeoutMs) =>
      fetchSearchApiPage(searchApiRequestBody(input, { nextPageToken: token, activeStatus: input.activeStatus }), {
        apiKey,
        fetchImpl: options.fetchImpl,
        timeoutMs,
      });
  }

  const started = Date.now();
  const maxPages = Math.max(1, input.maxPages ?? (Number(process.env.META_API_MAX_PAGES ?? process.env.SEARCHAPI_MAX_PAGES) || 40));
  const sourceUrl = sourceUrlFor(input);
  const normalizedInput: AdSearchInput = { ...input, country: (input.country ?? "IN").toUpperCase() };

  let token: string | null = null;
  let calls = 0;
  let adsOut = 0;
  let totalResults: number | null = null;
  let knownStreak = 0;
  const seen = new Set<string>();

  for (;;) {
    if (calls >= maxPages) return { calls, ads: adsOut, totalResults, stoppedBy: "max_pages", ms: Date.now() - started };
    // Leave room for one more call plus persisting its ads.
    if (calls > 0 && Date.now() > input.deadlineAt - 15_000) {
      return { calls, ads: adsOut, totalResults, stoppedBy: "deadline", ms: Date.now() - started };
    }

    const page = await fetchPage(token, Math.max(10_000, Math.min(45_000, input.deadlineAt - Date.now())));
    calls += 1;
    if (page.totalResults != null) totalResults = page.totalResults;

    const batch: CompetitorAd[] = [];
    let fresh = 0;
    for (const raw of page.ads) {
      const ad = libraryNodeToAd(toLibraryNode(raw), normalizedInput, sourceUrl, totalResults, {
        extractionMethod: `${provider}-meta-v1`,
        providerSource: provider,
      });
      if (!ad || seen.has(ad.id)) continue;
      if (!matchesBrandName(ad, input)) continue;
      seen.add(ad.id);
      if (!input.isKnown?.(ad.id)) fresh += 1;
      batch.push(ad);
    }
    if (batch.length) {
      await onBatch(batch);
      adsOut += batch.length;
    }

    knownStreak = fresh === 0 ? knownStreak + 1 : 0;
    if (input.stopAfterKnownPages && input.isKnown && knownStreak >= input.stopAfterKnownPages) {
      return { calls, ads: adsOut, totalResults, stoppedBy: "caught_up", ms: Date.now() - started };
    }

    token = page.nextPageToken;
    if (!token || page.ads.length === 0) {
      return { calls, ads: adsOut, totalResults, stoppedBy: "exhausted", ms: Date.now() - started };
    }
  }
}

function norm(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * A brand-name search without a page ID is a keyword search on Meta, which
 * also returns other advertisers that merely mention the word. Keep only ads
 * whose advertiser name contains every word of the brand name.
 */
export function matchesBrandName(ad: Pick<CompetitorAd, "advertiserName">, input: Pick<AdSearchInput, "mode" | "advertiserPageId" | "query">): boolean {
  if (input.advertiserPageId || input.mode === "keyword") return true;
  const q = norm(input.query);
  if (!q) return true;
  const name = norm(ad.advertiserName);
  return q.split(" ").every((token) => name.includes(token));
}

export type SearchApiPageResult = {
  page_id?: string | number | null;
  name?: string | null;
  verification?: string | null;
  likes?: number | null;
  ig_username?: string | null;
  image_uri?: string | null;
};

/**
 * Picks the one Meta page a brand name means, or null when it is ambiguous.
 * Exact (normalised) name matches only; if several match, a single verified
 * page wins; otherwise we don't guess.
 */
export function pickExactPage(query: string, pages: SearchApiPageResult[]): { pageId: string; name: string } | null {
  const q = norm(query);
  if (!q) return null;
  const exact = pages.filter((p) => p.page_id != null && /^\d{5,25}$/.test(String(p.page_id)) && norm(p.name) === q);
  const pick = (p: SearchApiPageResult) => ({ pageId: String(p.page_id), name: String(p.name ?? query) });
  if (exact.length === 1) return pick(exact[0]);
  const verified = exact.filter((p) => /VERIFIED/.test(String(p.verification ?? "")) && !/NOT_VERIFIED/.test(String(p.verification ?? "")));
  return verified.length === 1 ? pick(verified[0]) : null;
}

/** One billed call: brand name -> exact Meta page, when unambiguous. */
export async function resolvePageViaSearchApi(
  query: string,
  country: string,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ pageId: string; name: string } | null> {
  const apiKey = options.apiKey ?? searchApiKey();
  if (!apiKey || query.trim().length < 2) return null;
  const response = await (options.fetchImpl ?? fetch)(SEARCHAPI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ engine: "meta_ad_library_page_search", q: query.trim(), country: country.toUpperCase(), ad_type: "all" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as { page_results?: SearchApiPageResult[] | null } | null;
  return pickExactPage(query, Array.isArray(json?.page_results) ? json!.page_results! : []);
}

/** Provider-neutral name for the paging loop above. */
export const collectMetaAdsViaApi = collectMetaAdsViaSearchApi;
