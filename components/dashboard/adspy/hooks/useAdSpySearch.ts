import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_SUMMARY,
  isActiveJob,
  type Ad,
  type Intelligence,
  type Job,
  type Platform,
  type SearchMode,
  type SearchResponse,
  type Summary,
} from "../adspy-types";

type SearchOverrides = {
  query?: string;
  pageId?: string | null;
  country?: string;
  platform?: Platform;
  mode?: SearchMode;
};

const PAGE_SIZE = 36;
const CACHE_TTL_MS = 45_000;
const MAX_CACHE_ENTRIES = 12;

type CacheEntry = {
  expiresAt: number;
  response: SearchResponse;
};

function buildCacheKey(params: {
  query: string;
  country: string;
  platform: Platform;
  mode: SearchMode;
  pageId?: string | null;
  page: number;
}) {
  return [
    params.query.trim().toLowerCase(),
    params.country.trim().toUpperCase(),
    params.platform,
    params.mode,
    params.pageId ?? "",
    params.page,
  ].join("|");
}

export function useAdSpySearch({
  query,
  country,
  platform,
  mode,
  pageId,
}: {
  query: string;
  country: string;
  platform: Platform;
  mode: SearchMode;
  pageId: string | null;
}) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [intelligence, setIntelligence] =
    useState<Intelligence | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const prefetchedPagesRef = useRef(new Set<string>());

  const search = useCallback(
    async (
      nextPage = 1,
      silent = false,
      overrides: SearchOverrides = {},
    ): Promise<SearchResponse | null> => {
      const activeQuery = (overrides.query ?? query).trim();
      const activeCountry =
        (overrides.country ?? country).trim().toUpperCase() || "IN";
      const activePlatform = overrides.platform ?? platform;
      const activeMode = overrides.mode ?? mode;
      const activePageId =
        overrides.pageId !== undefined ? overrides.pageId : pageId;

      if (activeQuery.length < 2) {
        setAds([]);
        setSummary(EMPTY_SUMMARY);
        setIntelligence(null);
        setTotal(0);
        setPage(1);
        setTotalPages(0);
        setJob(null);
        setLastUpdatedAt(null);
        setRefreshing(false);
        return null;
      }

      const cacheKey = buildCacheKey({
        query: activeQuery,
        country: activeCountry,
        platform: activePlatform,
        mode: activeMode,
        pageId: activePageId,
        page: nextPage,
      });

      const cached = cacheRef.current.get(cacheKey);

      if (!silent && cached && cached.expiresAt > Date.now()) {
        const data = cached.response;

        setAds(data.ads ?? []);
        setSummary(data.summary ?? EMPTY_SUMMARY);
        setIntelligence(data.intelligence ?? null);
        setTotal(Number(data.total ?? 0));
        setPage(Number(data.page ?? nextPage));
        setTotalPages(Number(data.totalPages ?? 0));
        setJob(data.collectionJob ?? null);
        setLastUpdatedAt(data.lastUpdatedAt ?? null);
        setRefreshing(
          Boolean(
            data.isRefreshing ||
              isActiveJob(data.collectionJob?.status),
          ),
        );

        return data;
      }

      const requestId = ++requestIdRef.current;

      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) {
        setLoading(true);
      }

      setError("");

      try {
        const url = new URL(
          "/api/ad-intelligence/search",
          window.location.origin,
        );

        url.searchParams.set("q", activeQuery);
        url.searchParams.set("country", activeCountry);
        url.searchParams.set("platform", activePlatform);
        url.searchParams.set("mode", activeMode);
        url.searchParams.set("page", String(nextPage));
        url.searchParams.set("limit", String(PAGE_SIZE));

        if (
          activePageId &&
          activePlatform === "meta" &&
          activeMode === "advertiser"
        ) {
          url.searchParams.set("pageId", activePageId);
        }

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = (await response.json()) as SearchResponse;

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Search failed.");
        }

        cacheRef.current.set(cacheKey, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          response: data,
        });

        while (cacheRef.current.size > MAX_CACHE_ENTRIES) {
          const oldest = cacheRef.current.keys().next().value;

          if (!oldest) break;

          cacheRef.current.delete(oldest);
        }

        if (requestId !== requestIdRef.current) {
          return data;
        }

        setAds(data.ads ?? []);
        setSummary(data.summary ?? EMPTY_SUMMARY);
        setIntelligence(data.intelligence ?? null);
        setTotal(Number(data.total ?? 0));
        setPage(Number(data.page ?? nextPage));
        setTotalPages(Number(data.totalPages ?? 0));
        setJob(data.collectionJob ?? null);
        setLastUpdatedAt(data.lastUpdatedAt ?? null);
        setRefreshing(
          Boolean(
            data.isRefreshing ||
              isActiveJob(data.collectionJob?.status),
          ),
        );

        /*
         * Warm the next page in the background.
         * This doesn't affect the current render.
         */
        const nextPrefetchPage = Number(data.page ?? nextPage) + 1;
        const resolvedTotalPages = Number(data.totalPages ?? 0);

        if (
          nextPrefetchPage <= resolvedTotalPages &&
          resolvedTotalPages > 1
        ) {
          const prefetchKey = buildCacheKey({
            query: activeQuery,
            country: activeCountry,
            platform: activePlatform,
            mode: activeMode,
            pageId: activePageId,
            page: nextPrefetchPage,
          });

          if (
            !prefetchedPagesRef.current.has(prefetchKey) &&
            !cacheRef.current.has(prefetchKey)
          ) {
            prefetchedPagesRef.current.add(prefetchKey);

            const prefetchUrl = new URL(
              "/api/ad-intelligence/search",
              window.location.origin,
            );

            prefetchUrl.searchParams.set("q", activeQuery);
            prefetchUrl.searchParams.set("country", activeCountry);
            prefetchUrl.searchParams.set("platform", activePlatform);
            prefetchUrl.searchParams.set("mode", activeMode);
            prefetchUrl.searchParams.set(
              "page",
              String(nextPrefetchPage),
            );
            prefetchUrl.searchParams.set("limit", String(PAGE_SIZE));

            if (
              activePageId &&
              activePlatform === "meta" &&
              activeMode === "advertiser"
            ) {
              prefetchUrl.searchParams.set("pageId", activePageId);
            }

            void fetch(prefetchUrl, {
              cache: "no-store",
            })
              .then(async (prefetchResponse) => {
                if (!prefetchResponse.ok) return;

                const prefetchData =
                  (await prefetchResponse.json()) as SearchResponse;

                if (!prefetchData.success) return;

                cacheRef.current.set(prefetchKey, {
                  expiresAt: Date.now() + CACHE_TTL_MS,
                  response: prefetchData,
                });

                while (cacheRef.current.size > MAX_CACHE_ENTRIES) {
                  const oldest =
                    cacheRef.current.keys().next().value;

                  if (!oldest) break;

                  cacheRef.current.delete(oldest);
                }
              })
              .catch(() => {
                /* Prefetch is opportunistic. */
              });
          }
        }

        return data;
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return null;
        }

        if (requestId === requestIdRef.current) {
          setError(
            error instanceof Error
              ? error.message
              : "Search failed.",
          );
        }

        return null;
      } finally {
        if (requestId === requestIdRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [country, mode, pageId, platform, query],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    ads,
    summary,
    intelligence,
    job,
    setJob,
    total,
    page,
    totalPages,
    loading,
    refreshing,
    error,
    setError,
    lastUpdatedAt,
    search,
  };
}