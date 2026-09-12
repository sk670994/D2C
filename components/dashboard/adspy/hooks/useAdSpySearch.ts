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
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
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

  const search = useCallback(
    async (
      nextPage = 1,
      silent = false,
      overrides: SearchOverrides = {},
    ): Promise<SearchResponse | null> => {
      const activeQuery = (overrides.query ?? query).trim();
      const activeCountry = (
        overrides.country ?? country
      ).trim().toUpperCase() || "IN";
      const activePlatform = overrides.platform ?? platform;
      const activeMode = overrides.mode ?? mode;
      const activePageId = overrides.pageId ?? pageId;

      if (activeQuery.length < 2) {
        setAds([]);
        setSummary(EMPTY_SUMMARY);
        setIntelligence(null);
        setTotal(0);
        setPage(1);
        setTotalPages(0);
        setJob(null);
        setLastUpdatedAt(null);
        return null;
      }

      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) setLoading(true);
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
        url.searchParams.set("limit", "24");

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

        if (requestId !== requestIdRef.current) return data;

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

  useEffect(() => () => abortRef.current?.abort(), []);

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


