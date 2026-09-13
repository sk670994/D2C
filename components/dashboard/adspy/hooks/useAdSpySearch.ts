import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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

  pageId?:
    | string
    | null;

  country?: string;

  platform?: Platform;

  mode?: SearchMode;
};

const PAGE_SIZE = 36;

const PREFETCH_TTL_MS =
  45_000;

const PREFETCH_MAX_ENTRIES =
  12;

const responseCache =
  new Map<
    string,
    {
      expiresAt: number;
      response: SearchResponse;
    }
  >();

function cacheKey(
  input: {
    query: string;
    country: string;
    platform: Platform;
    mode: SearchMode;
    pageId?:
      | string
      | null;
    page: number;
  },
): string {
  return [
    input.query
      .trim()
      .toLowerCase(),

    input.country
      .trim()
      .toUpperCase(),

    input.platform,

    input.mode,

    input.pageId ??
      "",

    input.page,
  ].join("|");
}

function readCache(
  key: string,
): SearchResponse | null {
  const cached =
    responseCache.get(
      key,
    );

  if (!cached) {
    return null;
  }

  if (
    cached.expiresAt <=
    Date.now()
  ) {
    responseCache.delete(
      key,
    );

    return null;
  }

  return cached.response;
}

function writeCache(
  key: string,
  response: SearchResponse,
): void {
  responseCache.set(
    key,
    {
      expiresAt:
        Date.now() +
        PREFETCH_TTL_MS,

      response,
    },
  );

  while (
    responseCache.size >
    PREFETCH_MAX_ENTRIES
  ) {
    const oldestKey =
      responseCache.keys().next()
        .value as
        | string
        | undefined;

    if (!oldestKey) {
      break;
    }

    responseCache.delete(
      oldestKey,
    );
  }
}

async function fetchSearchResponse(
  query: string,
  country: string,
  platform: Platform,
  mode: SearchMode,
  pageId:
    | string
    | null
    | undefined,
  page: number,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const url =
    new URL(
      "/api/ad-intelligence/search",
      window.location.origin,
    );

  url.searchParams.set(
    "q",
    query,
  );

  url.searchParams.set(
    "country",
    country,
  );

  url.searchParams.set(
    "platform",
    platform,
  );

  url.searchParams.set(
    "mode",
    mode,
  );

  url.searchParams.set(
    "page",
    String(page),
  );

  url.searchParams.set(
    "limit",
    String(PAGE_SIZE),
  );

  if (
    pageId &&
    platform === "meta" &&
    mode === "advertiser"
  ) {
    url.searchParams.set(
      "pageId",
      pageId,
    );
  }

  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",

        signal,
      },
    );

  const data =
    (await response.json()) as SearchResponse;

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.error ??
        "Search failed.",
    );
  }

  return data;
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
  pageId:
    | string
    | null;
}) {
  const [
    ads,
    setAds,
  ] =
    useState<Ad[]>(
      [],
    );

  const [
    summary,
    setSummary,
  ] =
    useState<Summary>(
      EMPTY_SUMMARY,
    );

  const [
    intelligence,
    setIntelligence,
  ] =
    useState<
      Intelligence | null
    >(null);

  const [
    job,
    setJob,
  ] =
    useState<Job | null>(
      null,
    );

  const [
    total,
    setTotal,
  ] =
    useState(0);

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    totalPages,
    setTotalPages,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    lastUpdatedAt,
    setLastUpdatedAt,
  ] =
    useState<
      string | null
    >(null);

  const requestIdRef =
    useRef(0);

  const abortRef =
    useRef<
      AbortController | null
    >(null);

  const prefetchingRef =
    useRef(
      new Set<string>(),
    );

  const applyResponse =
    useCallback(
      (
        data: SearchResponse,
        requestedPage: number,
      ) => {
        setAds(
          data.ads ??
            [],
        );

        setSummary(
          data.summary ??
            EMPTY_SUMMARY,
        );

        setIntelligence(
          data.intelligence ??
            null,
        );

        setTotal(
          Number(
            data.total ??
              0,
          ),
        );

        setPage(
          Number(
            data.page ??
              requestedPage,
          ),
        );

        setTotalPages(
          Number(
            data.totalPages ??
              0,
          ),
        );

        setJob(
          data.collectionJob ??
            null,
        );

        setLastUpdatedAt(
          data.lastUpdatedAt ??
            null,
        );

        setRefreshing(
          Boolean(
            data.isRefreshing ||
              isActiveJob(
                data.collectionJob
                  ?.status,
              ),
          ),
        );
      },
      [],
    );

  const prefetchPage =
    useCallback(
      async (
        nextPage: number,
        overrides: SearchOverrides = {},
      ) => {
        const activeQuery =
          (
            overrides.query ??
            query
          ).trim();

        const activeCountry =
          (
            overrides.country ??
            country
          )
            .trim()
            .toUpperCase() ||
          "IN";

        const activePlatform =
          overrides.platform ??
          platform;

        const activeMode =
          overrides.mode ??
          mode;

        const activePageId =
          overrides.pageId ??
          pageId;

        if (
          activeQuery.length <
            2 ||
          nextPage <
            1
        ) {
          return;
        }

        const key =
          cacheKey({
            query:
              activeQuery,

            country:
              activeCountry,

            platform:
              activePlatform,

            mode:
              activeMode,

            pageId:
              activePageId,

            page:
              nextPage,
          });

        if (
          readCache(key) ||
          prefetchingRef.current.has(
            key,
          )
        ) {
          return;
        }

        prefetchingRef.current.add(
          key,
        );

        try {
          const data =
            await fetchSearchResponse(
              activeQuery,
              activeCountry,
              activePlatform,
              activeMode,
              activePageId,
              nextPage,
            );

          writeCache(
            key,
            data,
          );
        } catch {
          /*
           * Prefetch is opportunistic.
           * Never surface a background
           * prefetch failure to the UI.
           */
        } finally {
          prefetchingRef.current.delete(
            key,
          );
        }
      },
      [
        country,
        mode,
        pageId,
        platform,
        query,
      ],
    );

  const search =
    useCallback(
      async (
        nextPage = 1,
        silent = false,
        overrides: SearchOverrides = {},
      ): Promise<SearchResponse | null> => {
        const activeQuery =
          (
            overrides.query ??
            query
          ).trim();

        const activeCountry =
          (
            overrides.country ??
            country
          )
            .trim()
            .toUpperCase() ||
          "IN";

        const activePlatform =
          overrides.platform ??
          platform;

        const activeMode =
          overrides.mode ??
          mode;

        const activePageId =
          overrides.pageId ??
          pageId;

        if (
          activeQuery.length <
          2
        ) {
          setAds(
            [],
          );

          setSummary(
            EMPTY_SUMMARY,
          );

          setIntelligence(
            null,
          );

          setTotal(
            0,
          );

          setPage(
            1,
          );

          setTotalPages(
            0,
          );

          setJob(
            null,
          );

          setLastUpdatedAt(
            null,
          );

          setRefreshing(
            false,
          );

          return null;
        }

        const key =
          cacheKey({
            query:
              activeQuery,

            country:
              activeCountry,

            platform:
              activePlatform,

            mode:
              activeMode,

            pageId:
              activePageId,

            page:
              nextPage,
          });

        const cached =
          readCache(key);

        const requestId =
          ++requestIdRef.current;

        abortRef.current?.abort();

        if (cached) {
          applyResponse(
            cached,
            nextPage,
          );

          setError(
            "",
          );

          setLoading(
            false,
          );

          void prefetchPage(
            nextPage + 1,
            overrides,
          );

          return cached;
        }

        const controller =
          new AbortController();

        abortRef.current =
          controller;

        if (!silent) {
          setLoading(
            true,
          );
        }

        setError(
          "",
        );

        try {
          const data =
            await fetchSearchResponse(
              activeQuery,
              activeCountry,
              activePlatform,
              activeMode,
              activePageId,
              nextPage,
              controller.signal,
            );

          if (
            requestId !==
            requestIdRef.current
          ) {
            return data;
          }

          applyResponse(
            data,
            nextPage,
          );

          writeCache(
            key,
            data,
          );

          const next =
            nextPage + 1;

          const availablePages =
            Number(
              data.totalPages ??
                0,
            );

          if (
            next <=
            availablePages
          ) {
            void prefetchPage(
              next,
              overrides,
            );
          }

          return data;
        } catch (
          searchError
        ) {
          if (
            searchError instanceof
              DOMException &&
            searchError.name ===
              "AbortError"
          ) {
            return null;
          }

          if (
            requestId ===
            requestIdRef.current
          ) {
            setError(
              searchError instanceof
                Error
                ? searchError.message
                : "Search failed.",
            );
          }

          return null;
        } finally {
          if (
            requestId ===
              requestIdRef.current &&
            !silent
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        applyResponse,
        country,
        mode,
        pageId,
        platform,
        prefetchPage,
        query,
      ],
    );

  useEffect(
    () => {
      return () => {
        abortRef.current?.abort();
      };
    },
    [],
  );

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

    prefetchPage,

    pageSize:
      PAGE_SIZE,
  };
}