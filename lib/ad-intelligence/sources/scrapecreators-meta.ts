/**
 * ScrapeCreators as a Meta Ad Library source (cheapest paid option:
 * prepaid credits that never expire, 1 credit per call, ~30 ads per call).
 *
 * Returns Meta's own ad node shape (ad_archive_id, page_id, is_active,
 * start_date as unix seconds, snapshot{...}), so it goes through the same
 * paging loop and mapper as SearchApi (sources/searchapi-meta.ts).
 * Docs: https://docs.scrapecreators.com/v1/facebook/adLibrary/company/ads
 */
import type { AdSearchInput } from "../provider";
import type { CompetitorAd } from "../types";
import {
  collectMetaAdsViaApi,
  pickExactPage,
  SearchApiError,
  type SearchApiCollectInput,
  type SearchApiCollectResult,
  type SearchApiMetaAd,
  type SearchApiPage,
  type SearchApiPageResult,
} from "./searchapi-meta";

export const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";

export function scrapeCreatorsKey(): string | null {
  const raw = process.env.SCRAPECREATORS_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return raw ? raw : null;
}

type ScResponse = {
  success?: boolean;
  message?: string | null;
  error?: string | null;
  results?: SearchApiMetaAd[] | null;
  searchResults?: SearchApiMetaAd[] | null;
  ads?: SearchApiMetaAd[] | null;
  cursor?: string | null;
  next_cursor?: string | null;
  searchResultsCount?: number | null;
  totalCount?: number | null;
  total_count?: number | null;
  credits_remaining?: number | null;
};

/** Request for one page: exact page (company ads) or a keyword search. */
export function scrapeCreatorsRequest(
  input: Pick<AdSearchInput, "query" | "country" | "advertiserPageId">,
  options: { activeStatus?: "active" | "inactive" | "all"; cursor?: string | null } = {},
): { path: string; body: Record<string, string | boolean> } {
  const body: Record<string, string | boolean> = {
    country: (input.country ?? "IN").trim().toUpperCase() || "IN",
    status: (options.activeStatus ?? "all").toUpperCase(),
    media_type: "ALL",
  };
  const pageId = input.advertiserPageId?.trim();
  let path: string;
  if (pageId) {
    path = "/v1/facebook/adLibrary/company/ads";
    body.pageId = pageId;
  } else {
    path = "/v1/facebook/adLibrary/search/ads";
    body.query = input.query.trim();
  }
  if (options.cursor) body.cursor = options.cursor;
  return { path, body };
}

/** Page from any of the response spellings the API uses. */
export function parseScrapeCreatorsPage(json: ScResponse | null, ms: number): SearchApiPage {
  const list = json?.results ?? json?.searchResults ?? json?.ads ?? [];
  const total = Number(json?.searchResultsCount ?? json?.totalCount ?? json?.total_count);
  return {
    ads: Array.isArray(list) ? list.filter(Boolean) : [],
    totalResults: Number.isFinite(total) && total >= 0 ? total : null,
    nextPageToken: json?.cursor || json?.next_cursor || null,
    ms,
  };
}

/** One billed call. POST + JSON body: cursors grow large while paging. */
export async function fetchScrapeCreatorsPage(
  request: { path: string; body: Record<string, string | boolean> },
  options: { apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<SearchApiPage> {
  const started = Date.now();
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${SCRAPECREATORS_BASE}${request.path}`, {
      method: "POST",
      headers: { "x-api-key": options.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
  } catch (error) {
    throw new SearchApiError(`ScrapeCreators unreachable: ${error instanceof Error ? error.message : String(error)}`, null, true);
  }
  const json = (await response.json().catch(() => null)) as ScResponse | null;
  if (!response.ok || json?.success === false) {
    const status = response.status;
    const message = json?.message || json?.error || `HTTP ${status}`;
    // 401 bad key, 402 out of credits, 400 bad request: retrying won't help.
    throw new SearchApiError(`ScrapeCreators: ${message}`, status, status === 429 || status >= 500);
  }
  return parseScrapeCreatorsPage(json, Date.now() - started);
}

/** Same contract as collectMetaAdsViaSearchApi, billed per ScrapeCreators call. */
export async function collectMetaAdsViaScrapeCreators(
  input: SearchApiCollectInput,
  onBatch: (ads: CompetitorAd[]) => Promise<void> | void,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<SearchApiCollectResult> {
  const apiKey = options.apiKey ?? scrapeCreatorsKey();
  if (!apiKey) throw new SearchApiError("SCRAPECREATORS_API_KEY is not set", null, false);
  return collectMetaAdsViaApi(input, onBatch, {
    provider: "scrapecreators",
    fetchPage: (cursor, timeoutMs) =>
      fetchScrapeCreatorsPage(scrapeCreatorsRequest(input, { activeStatus: input.activeStatus, cursor }), {
        apiKey,
        timeoutMs,
        fetchImpl: options.fetchImpl,
      }),
  });
}

/** One credit: brand name -> exact Meta page, only when unambiguous. */
export async function resolvePageViaScrapeCreators(
  query: string,
  _country: string,
  options: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ pageId: string; name: string } | null> {
  const apiKey = options.apiKey ?? scrapeCreatorsKey();
  if (!apiKey || query.trim().length < 2) return null;
  const url = `${SCRAPECREATORS_BASE}/v1/facebook/adLibrary/search/companies?query=${encodeURIComponent(query.trim())}`;
  const response = await (options.fetchImpl ?? fetch)(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as { searchResults?: SearchApiPageResult[] | null } | null;
  return pickExactPage(query, Array.isArray(json?.searchResults) ? json!.searchResults! : []);
}
