"use client";

import { FILTERS } from "./adspy-types";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { AdSpyAnalysis } from "./AdSpyAnalysis";
import { AdSpyHistory } from "./components/AdSpyHistory";
import { AdSpyCreativeCard } from "./components/AdSpyCreativeCard";
import { AdSpyLoadingIntelligence } from "./components/AdSpyLoadingIntelligence";
import { AdSpySearchBar } from "./components/AdSpySearchBar";
import { AdSpyStats } from "./components/AdSpyStats";
import { AdSpyToolbar } from "./components/AdSpyToolbar";
import { AdSpy3DJokePulse } from "./components/AdSpy3DJokePulse";
import { AdSpy3DCreativeReel } from "./components/AdSpy3DCreativeReel";
import { AdSpy3DHero } from "@/components/ui/adspy/AdSpy3DHero";

type Platform = "meta" | "google" | "linkedin";
type SearchMode = "advertiser" | "keyword";

type Ad = {
  id: string;
  platform: Platform;
  advertiserName?: string | null;
  creatorName?: string | null;
  country?: string | null;
  creativeType?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  callToAction?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  isActive?: boolean | null;
  publisherPlatforms?: string[];
  landingPage?: string | null;
  sourceUrl?: string | null;
  productName?: string | null;
  offer?: string | null;
  runningDays?: number | null;
};

type AutocompleteAdvertiser = {
  id: string;
  pageId: string;
  label: string;
  type: "advertiser";
  domain?: string | null;
  profileUrl?: string | null;
  profileImageUrl?: string | null;
  category?: string | null;
  verification?: string | null;
  likes?: number | null;
  igFollowers?: number | null;
};

type Job = {
  id: string;
  status: string;
  stage: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  errorMessage?: string | null;
};

type Summary = {
  totalAds: number;
  activeAds: number;
  inactiveAds: number;
  videoAds: number;
  imageAds: number;
  carouselAds: number;
  creatorAds: number;
  averageRunningDays: number;
  longestRunningDays: number;
};

type Intelligence = {
  topCreators: Array<{ label: string; count: number }>;
  topOffers: Array<{ label: string; count: number }>;
  topHooks: Array<{ label: string; count: number }>;
  longestRunningAd: {
    advertiserName?: string | null;
    headline?: string | null;
    runningDays?: number | null;
  } | null;
  reach: { status: "unavailable"; reason: string };
};

type SearchResponse = {
  success: boolean;
  query?: string;
  country?: string;
  platform?: Platform;
  mode?: SearchMode;
  pageId?: string | null;
  ads?: Ad[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  summary?: Summary;
  intelligence?: Intelligence | null;
  lastUpdatedAt?: string | null;
  isRefreshing?: boolean;
  collectionJobId?: string | null;
  collectionJob?: Job | null;
  error?: string;
};

type TrackResponse = {
  success: boolean;
  tracked?: boolean;
  jobId?: string | null;
  dispatched?: boolean;
  error?: string;
  job?: Job | null;
};

const EMPTY_SUMMARY: Summary = {
  totalAds: 0,
  activeAds: 0,
  inactiveAds: 0,
  videoAds: 0,
  imageAds: 0,
  carouselAds: 0,
  creatorAds: 0,
  averageRunningDays: 0,
  longestRunningDays: 0,
};

type FilterId = (typeof FILTERS)[number][0];

const ACTIVE_STATUSES = new Set(["queued", "scraping", "normalizing", "enriching", "finalizing"]);
const AUTOCOMPLETE_CACHE_TTL_MS = 20_000;
const AUTOCOMPLETE_CACHE_MAX = 80;

const autocompleteCache = new Map<
  string,
  {
    expiresAt: number;
    advertisers: AutocompleteAdvertiser[];
  }
>();

function readAutocompleteCache(key: string) {
  const entry = autocompleteCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    autocompleteCache.delete(key);
    return null;
  }
  return entry.advertisers;
}

function writeAutocompleteCache(
  key: string,
  advertisers: AutocompleteAdvertiser[],
) {
  autocompleteCache.set(key, {
    expiresAt: Date.now() + AUTOCOMPLETE_CACHE_TTL_MS,
    advertisers,
  });

  while (autocompleteCache.size > AUTOCOMPLETE_CACHE_MAX) {
    const oldest = autocompleteCache.keys().next().value;
    if (!oldest) break;
    autocompleteCache.delete(oldest);
  }
}

function readBestPrefixAutocompleteCache(
  platform: Platform,
  country: string,
  query: string,
): AutocompleteAdvertiser[] | null {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return null;

  let bestQuery = "";
  let bestResults: AutocompleteAdvertiser[] | null = null;

  for (const [key, entry] of autocompleteCache.entries()) {
    if (entry.expiresAt <= Date.now()) continue;

    const [entryPlatform, entryCountry, entryQuery] = key.split("|");
    if (entryPlatform !== platform || entryCountry !== country) continue;
    if (!normalized.startsWith(entryQuery)) continue;
    if (entryQuery.length <= bestQuery.length) continue;

    bestQuery = entryQuery;
    bestResults = entry.advertisers;
  }

  if (!bestResults?.length) return null;

  return bestResults.filter((advertiser) =>
    advertiser.label.toLowerCase().includes(normalized),
  );
}


function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}


function isActiveJob(status?: string | null) {
  return Boolean(status && ACTIVE_STATUSES.has(status));
}

export type AdSpySectionProps = {
  query?: string;
  country?: string;
  platform?: Platform;
  onQueryChange?: (query: string) => void;
  onCountryChange?: (country: string) => void;
  onPlatformChange?: (platform: Platform) => void;
  onResultCountChange?: (count: number) => void;
  initialSuggestionCatalog?: unknown[];
};


function proxyMediaUrl(value: string): string {
  return `/api/ad-intelligence/media?url=${encodeURIComponent(value)}`;
}


export function AdSpySection({ query = "", country = "IN", platform = "meta", onQueryChange, onCountryChange, onPlatformChange, onResultCountChange }: AdSpySectionProps) {
  const [input, setInput] = useState(query);
  const [countryInput, setCountryInput] = useState(country.toUpperCase());
  const [mode, setMode] = useState<SearchMode>("advertiser");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteAdvertisers, setAutocompleteAdvertisers] = useState<AutocompleteAdvertiser[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [job, setJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [error, setError] = useState("");
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const lastPolledPersistedRef = useRef(-1);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
      pollAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setInput(query), 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCountryInput(country.toUpperCase()), 0);
    return () => window.clearTimeout(timer);
  }, [country]);

  useEffect(() => {
    if (!onResultCountChange) return;
    const timer = window.setTimeout(() => onResultCountChange(total), 0);
    return () => window.clearTimeout(timer);
  }, [onResultCountChange, total]);

  const fetchSearch = useCallback(async (nextPage = 1, silent = false, overrideQuery?: string, overridePageId?: string | null) => {
    const q = (overrideQuery ?? input).trim();
    const c = countryInput.trim().toUpperCase();
    if (q.length < 2) {
      setAds([]); setTotal(0); setTotalPages(0); setSummary(EMPTY_SUMMARY); setJob(null); setLastUpdatedAt(null); return null;
    }

    const requestId = ++searchRequestRef.current;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    if (!silent) setLoading(true);
    setError("");

    try {
      const url = new URL("/api/ad-intelligence/search", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("country", c || "IN");
      url.searchParams.set("platform", platform);
      url.searchParams.set("mode", mode);
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("limit", "36");
      const searchPageId = overridePageId !== undefined ? overridePageId : selectedPageId;
      if (searchPageId && platform === "meta" && mode === "advertiser") url.searchParams.set("pageId", searchPageId);

      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const data = (await response.json()) as SearchResponse;
      if (!response.ok || !data.success) throw new Error(data.error || "Search failed.");
      if (!mountedRef.current || requestId !== searchRequestRef.current) return data;

      setAds(data.ads ?? []);
      setTotal(Number(data.total ?? 0));
      setPage(Number(data.page ?? nextPage));
      setTotalPages(Number(data.totalPages ?? 0));
      setSummary(data.summary ?? EMPTY_SUMMARY);
      setJob(data.collectionJob ?? null);
      setLastUpdatedAt(data.lastUpdatedAt ?? null);
      setRefreshing(Boolean(data.isRefreshing || isActiveJob(data.collectionJob?.status)));
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Search failed.");
      return null;
    } finally {
      if (mountedRef.current && requestId === searchRequestRef.current && !silent) setLoading(false);
    }
  }, [countryInput, input, mode, platform, selectedPageId]);

  const refreshAndPoll = useCallback(async (existingJobId?: string | null, overridePageId?: string | null) => {
    const q = input.trim();
    if (q.length < 2) return;
    setRefreshing(true);
    setError("");

    let jobId = existingJobId ?? job?.id ?? null;
    try {
      if (!jobId || !isActiveJob(job?.status)) {
        const url = new URL("/api/ad-intelligence/refresh", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN");
        url.searchParams.set("platform", platform);
        url.searchParams.set("mode", mode);
        const searchPageId = overridePageId !== undefined ? overridePageId : selectedPageId;
      if (searchPageId && platform === "meta" && mode === "advertiser") url.searchParams.set("pageId", searchPageId);

        const response = await fetch(url, { method: "POST", cache: "no-store" });
        const data = (await response.json()) as { success: boolean; job?: Job; error?: string };
        if (!response.ok || !data.success || !data.job) throw new Error(data.error || "Could not start collection.");
        jobId = data.job.id;
        setJob(data.job);
      }

      if (!jobId) return;
      pollAbortRef.current?.abort();
      const controller = new AbortController();
      pollAbortRef.current = controller;
      lastPolledPersistedRef.current = -1;
      const started = Date.now();
      let delay = 1200;

      while (Date.now() - started < 10 * 60_000) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (controller.signal.aborted || !mountedRef.current) return;

        const response = await fetch(`/api/ad-intelligence/search/status/${encodeURIComponent(jobId)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { success: boolean; job?: Job; error?: string };
        if (response.status === 401) throw new Error("Your session expired. Please sign in again.");
        if (!response.ok || !data.success || !data.job) throw new Error(data.error || "Collection status unavailable.");
        const current = data.job;
        setJob(current);

        const persisted = Number(current.persistedAds ?? 0);
        const changed = persisted !== lastPolledPersistedRef.current;
        if (changed || isActiveJob(current.status) === false) {
          lastPolledPersistedRef.current = persisted;
          await fetchSearch(1, true);
        }

        if (current.status === "complete") {
          setRefreshing(false);
          await fetchSearch(1, true);
          return;
        }
        if (current.status === "failed") throw new Error(current.errorMessage || "Collection failed.");
        delay = Math.min(5000, Math.round(delay * 1.35));
      }

      throw new Error("Collection is taking longer than expected. The results page remains available while the job finishes.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (mountedRef.current) setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [countryInput, fetchSearch, input, job, mode, platform, selectedPageId]);

  const runSearch = useCallback(async (overrideQuery?: string, overridePageId?: string | null) => {
    const q = (overrideQuery ?? input).trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    onQueryChange?.(q);
    onCountryChange?.(countryInput.trim().toUpperCase() || "IN");
    onPlatformChange?.(platform);
    setSuggestionOpen(false);
    setPage(1);
    const result = await fetchSearch(1, false, q, overridePageId);
    if (!result) return;
    setSubmittedQuery(q);
    void (async () => {
      try {
        const url = new URL("/api/ad-intelligence/track", window.location.origin);
        url.searchParams.set("query", q);
        url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN");
        url.searchParams.set("platform", platform);
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok || !mountedRef.current) return;
        const data = await response.json() as { tracked?: boolean };
        if (mountedRef.current) setTracked(Boolean(data.tracked));
      } catch {
        // Tracking state is optional and must never block search results.
      }
    })();
    const active = Boolean(result.isRefreshing || isActiveJob(result.collectionJob?.status));
    if (active && result.collectionJob?.id) {
      void refreshAndPoll(result.collectionJob.id, overridePageId ?? selectedPageId);
      return;
    }
    if (Number(result.total ?? 0) === 0 || Number(result.summary?.totalAds ?? 0) === 0) {
      void refreshAndPoll(result.collectionJobId ?? null, overridePageId ?? selectedPageId);
    }
  }, [countryInput, fetchSearch, input, onCountryChange, onPlatformChange, onQueryChange, platform, refreshAndPoll, selectedPageId]);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || mode !== "advertiser" || platform !== "meta") {
      return;
    }

    const normalizedCountry = countryInput.trim().toUpperCase() || "IN";
    const cacheKey = `${platform}|${normalizedCountry}|${q.toLowerCase()}`;
    const controller = new AbortController();
    let alive = true;

    const prefixCached = readBestPrefixAutocompleteCache(
      platform,
      normalizedCountry,
      q,
    );

    if (prefixCached?.length && mountedRef.current) {
      setAutocompleteAdvertisers(prefixCached);
      setAutocompleteLoading(true);
    }

    const timer = window.setTimeout(async () => {
      const cached = readAutocompleteCache(cacheKey);

      if (cached) {
        if (alive && mountedRef.current) {
          setAutocompleteAdvertisers(cached);
          setAutocompleteLoading(false);
        }
        return;
      }

      if (alive && mountedRef.current) {
        setAutocompleteLoading(true);
      }

      try {
        const url = new URL("/api/ad-intelligence/autocomplete", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN");
        url.searchParams.set("platform", platform);

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const data = (await response.json()) as {
          advertisers?: AutocompleteAdvertiser[];
        };

        if (!response.ok) throw new Error("Autocomplete request failed.");

        const advertisers = data.advertisers ?? [];
        writeAutocompleteCache(cacheKey, advertisers);

        if (alive && mountedRef.current) {
          setAutocompleteAdvertisers(advertisers);
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (alive && mountedRef.current) {
          setAutocompleteAdvertisers([]);
        }
      } finally {
        if (alive && mountedRef.current) {
          setAutocompleteLoading(false);
        }
      }
    }, 90);

    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [countryInput, input, mode, platform]);

  const handleTrack = useCallback(async () => {
    const q = input.trim();
    if (q.length < 2) return;
    try {
      if (tracked) {
        const url = new URL("/api/ad-intelligence/track", window.location.origin);
        url.searchParams.set("query", q); url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN"); url.searchParams.set("platform", platform);
        const response = await fetch(url, { method: "DELETE" });
        const data = await response.json() as { success: boolean; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error || "Could not stop tracking.");
        setTracked(false);
        return;
      }

      const response = await fetch("/api/ad-intelligence/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, country: countryInput.trim().toUpperCase() || "IN", platform }),
      });
      const data = await response.json() as TrackResponse;
      if (!response.ok || !data.success) throw new Error(data.error || "Could not start tracking.");
      setTracked(true);
      if (data.job) setJob(data.job);
      if (data.jobId) void refreshAndPoll(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracking failed.");
    } finally {
      }
  }, [countryInput, input, platform, refreshAndPoll, tracked]);

  const visibleAds = useMemo(() => {
    const sorted = [...ads];
    switch (filter) {
      case "active": return sorted.filter((ad) => ad.isActive !== false);
      case "video": return sorted.filter((ad) => ad.creativeType === "video");
      case "image": return sorted.filter((ad) => ad.creativeType === "image");
      case "carousel": return sorted.filter((ad) => ad.creativeType === "carousel");
      case "creator": return sorted.filter((ad) => Boolean(ad.creatorName));
      case "longest": return sorted.sort((a, b) => Number(b.runningDays ?? 0) - Number(a.runningDays ?? 0));
      default: return sorted;
    }
  }, [ads, filter]);

  const handleSelectAdvertiser = useCallback((advertiser: AutocompleteAdvertiser) => {
    const label = advertiser.label.trim();
    setInput(label);
    setAutocompleteAdvertisers([]);
    setSelectedPageId(advertiser.pageId);
    setSuggestionOpen(false);
    onQueryChange?.(label);
    void runSearch(label, advertiser.pageId);
  }, [onQueryChange, runSearch]);

  const handleSelectQuery = useCallback((q: string) => {
    setInput(q);
    setAutocompleteAdvertisers([]);
    setSelectedPageId(null);
    setSuggestionOpen(false);
    onQueryChange?.(q);
  }, [onQueryChange]);

  const headline = selectedPageId ? `Verified Meta advertiser search` : `Competitive ad intelligence`;
  const statusLabel = refreshing ? "Collecting fresh creatives" : job?.status === "complete" ? "Dataset current" : "Search the live intelligence index";

  return (
    <section data-adspy-root data-adspy-v8 className="mx-auto w-full max-w-[1380px] space-y-4 pb-10">
      <div className="relative z-[100] overflow-visible rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600"><Sparkles size={13} /> AdSpy Intelligence</div>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">{headline}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Search a brand or keyword, inspect the creative system, and let the collector broaden the dataset in the background without replacing usable results.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${refreshing ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600"}`}><Activity size={13} className={refreshing ? "animate-pulse" : ""} />{statusLabel}</span>
              {lastUpdatedAt ? <span className="text-xs text-slate-400">Updated {dateLabel(lastUpdatedAt)}</span> : null}
            </div>
          </div>
          <AdSpy3DHero />
        </div>

        <div className="relative z-[1000] mt-5 isolate">
          <AdSpySearchBar
            value={input}
            country={countryInput}
            platform={platform}
            mode={mode}
            advertisers={autocompleteAdvertisers}
            autocompleteLoading={autocompleteLoading}
            suggestionsOpen={suggestionOpen}
            selectedPageId={selectedPageId}
            onChange={(value) => {
              setInput(value);
              if (selectedPageId) setSelectedPageId(null);
              setSuggestionOpen(true);
            }}
            onSearch={() => void runSearch()}
            onSelectAdvertiser={handleSelectAdvertiser}
            onSelectQuery={() => handleSelectQuery(input.trim())}
            onFocus={() => setSuggestionOpen(true)}
            onCloseSuggestions={() => setSuggestionOpen(false)}
            onCountryChange={setCountryInput}
          />
        </div>

        <div className="mt-2">
          <AdSpyToolbar
            mode={mode}
            platform={platform}
            filter={filter}
            tracked={tracked}
            refreshing={refreshing}
            disabled={input.trim().length < 2}
            onModeChange={(value) => {
              setMode(value);
              setSelectedPageId(null);
            }}
            onFilterChange={setFilter}
            onRefresh={() => void refreshAndPoll(job?.id ?? null)}
            onTrack={() => void handleTrack()}
          />
        </div>
      </div>

      {error ? <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => setError("")}><X size={16} /></button></div> : null}

      {refreshing && job ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"><div className="flex items-center gap-2 font-semibold"><Loader2 size={15} className="animate-spin" />Background collection in progress</div><div className="mt-1 text-xs text-blue-700">Discovered {job.discoveredAds} · persisted {job.persistedAds}. Results update automatically as new creatives arrive.</div></div>
      ) : null}

      {(loading || refreshing) ? (
        <AdSpyLoadingIntelligence compact={refreshing} loading />
      ) : null}

      <AdSpyStats summary={{ ...summary, totalAds: summary.totalAds || total }} />

      {submittedQuery ? <AdSpy3DJokePulse /> : null}
      {visibleAds.length ? <AdSpy3DCreativeReel ads={visibleAds} onInspect={setSelectedAd} /> : null}

      {visibleAds.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleAds.map((ad) => (
            <AdSpyCreativeCard
              key={`${ad.platform}:${ad.id}`}
              ad={ad}
              onInspect={() => setSelectedAd(ad)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          {loading || refreshing ? <Loader2 size={24} className="mx-auto animate-spin text-slate-400" /> : <Search size={24} className="mx-auto text-slate-300" />}
          <h3 className="mt-4 text-base font-semibold text-slate-900">{input.trim().length < 2 ? "Start with an advertiser or keyword" : refreshing ? "Collecting observable creatives…" : "No ads in the current index"}</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{input.trim().length < 2 ? "Search a brand first. Selecting an autocomplete advertiser uses the exact Meta Page ID when available." : "A successful API response with zero rows means the index did not have matching ads yet; refresh to start a fresh collection."}</p>
        </div>
      )}

      {totalPages > 1 ? <div className="flex items-center justify-center gap-3"><button type="button" disabled={page <= 1} onClick={() => { const next = Math.max(1, page - 1); setPage(next); void fetchSearch(next, true); }} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"><ChevronLeft size={16} /></button><span className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => { const next = Math.min(totalPages, page + 1); setPage(next); void fetchSearch(next, true); }} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 disabled:opacity-40"><ChevronRight size={16} /></button></div> : null}

      {submittedQuery ? (
        <>
          <AdSpyAnalysis query={submittedQuery} country={countryInput} platform={platform} />
          <AdSpyHistory query={submittedQuery} country={countryInput} platform={platform} />
        </>
      ) : null}

      {selectedAd ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-md sm:p-4 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Creative inspection"
        >
          <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/60 bg-white shadow-[0_30px_100px_rgba(15,23,42,.28)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-600">Creative inspection</div>
                <h2 className="mt-1 truncate text-base font-semibold text-slate-950 sm:text-lg">
                  {selectedAd.headline || selectedAd.productName || "Untitled creative"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedAd.advertiserName || "Unknown advertiser"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAd(null)}
                title="Close"
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
              >
                <img src="/adspy/icons/close.svg" alt="" width="12" height="12" />
              </button>
            </div>

            <div className="grid max-h-[calc(94vh-73px)] overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
              <div className="border-b border-slate-100 bg-slate-50 p-3 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {safeUrl(selectedAd.videoUrl) ? (
                    <video
                      src={safeUrl(selectedAd.videoUrl)!}
                      controls
                      playsInline
                      preload="metadata"
                      poster={safeUrl(selectedAd.thumbnailUrl || selectedAd.imageUrl) ?? undefined}
                      className="max-h-[62vh] w-full bg-slate-950 object-contain"
                    />
                  ) : safeUrl(selectedAd.thumbnailUrl || selectedAd.imageUrl) ? (
                    <img
                      src={safeUrl(selectedAd.thumbnailUrl || selectedAd.imageUrl)!}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (!target.dataset.proxyTried) {
                          target.dataset.proxyTried = "1";
                          target.src = proxyMediaUrl(safeUrl(selectedAd.thumbnailUrl || selectedAd.imageUrl)!);
                        }
                      }}
                      className="max-h-[62vh] w-full object-contain"
                    />
                  ) : (
                    <div className="grid min-h-[360px] place-items-center text-sm text-slate-400">
                      Media unavailable
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Primary text</div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {selectedAd.primaryText || selectedAd.description || "No copy captured."}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Advertiser", selectedAd.advertiserName],
                    ["Creator", selectedAd.creatorName],
                    ["Creative type", selectedAd.creativeType],
                    ["Status", selectedAd.isActive === false ? "Inactive" : "Active"],
                    ["First seen", dateLabel(selectedAd.firstSeen)],
                    ["Last seen", dateLabel(selectedAd.lastSeen)],
                    ["Running", selectedAd.runningDays != null ? `${selectedAd.runningDays} days` : "—"],
                    ["CTA", selectedAd.callToAction],
                    ["Product", selectedAd.productName],
                    ["Offer", selectedAd.offer],
                    ["Country", selectedAd.country],
                    ["Publishers", selectedAd.publisherPlatforms?.join(", ")],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                      <div className="mt-1 break-words text-xs font-semibold leading-5 text-slate-800">
                        {value || "—"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Landing page</div>
                    {safeUrl(selectedAd.landingPage) ? (
                      <a
                        href={safeUrl(selectedAd.landingPage)!}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-words text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {selectedAd.landingPage}
                      </a>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-slate-700">—</div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Source</div>
                    {safeUrl(selectedAd.sourceUrl) ? (
                      <a
                        href={safeUrl(selectedAd.sourceUrl)!}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Open public source ↗
                      </a>
                    ) : (
                      <div className="mt-1 text-xs font-semibold text-slate-700">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
