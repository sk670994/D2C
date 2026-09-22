"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  History,
  Image as ImageIcon,
  Loader2,
  Play,
  Search,
  Sparkles,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { AdvertiserIntelligenceCard } from "./AdvertiserIntelligenceCard";
import type {
  Ad,
  AutocompleteAdvertiser,
  Intelligence,
  Job,
  Platform,
  SearchMode,
  SearchResponse,
  FilterId,
  Summary,
} from "./adspy-types";

const PAGE_SIZE = 25;
const AUTOCOMPLETE_DEBOUNCE_MS = 180;
const SEARCH_CACHE_TTL_MS = 12_000;
const AUTOCOMPLETE_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX = 18;
const AUTOCOMPLETE_CACHE_MAX = 200;
const POLL_START_MS = 450;
const POLL_MAX_MS = 3000;
const STALE_STATUSES = new Set(["queued", "scraping", "normalizing", "enriching", "finalizing", "deep_queued", "deep"]);
const TERMINAL_STATUSES = new Set(["complete", "exhausted", "failed", "cancelled"]);

const searchCache = new Map<string, { expiresAt: number; response: SearchResponse }>();
const autocompleteCache = new Map<string, { expiresAt: number; advertisers: AutocompleteAdvertiser[] }>();

const EMPTY: Summary = {
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

function searchKey(input: {
  query: string;
  country: string;
  platform: Platform;
  mode: SearchMode;
  pageId?: string | null;
  page: number;
  filter?: FilterId;
  language?: string;
  region?: string;
}) {
  return [
    input.query.trim().toLowerCase(),
    input.country.trim().toUpperCase(),
    input.platform,
    input.mode,
    input.pageId ?? "",
    input.page,
    input.filter ?? "all",
    input.language?.trim().toLowerCase() ?? "",
    input.region?.trim().toLowerCase() ?? "",
  ].join("|");
}

function cacheGet<T>(cache: Map<string, { expiresAt: number; [key: string]: unknown }>, key: string, field: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return (entry[field] as T | undefined) ?? null;
}

function cacheWrite(cache: Map<string, { expiresAt: number; [key: string]: unknown }>, key: string, value: unknown, field: string, ttl: number, max: number) {
  cache.set(key, { expiresAt: Date.now() + ttl, [field]: value });
  while (cache.size > max) {
    const first = cache.keys().next().value;
    if (!first) break;
    cache.delete(first);
  }
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  const date = safeDate(value);
  return date ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not publicly available";
}

function formatNumber(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function labelize(value?: string | null) {
  return String(value ?? "unknown").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function statusCopy(status?: string | null) {
  switch (status) {
    case "queued": return "Preparing library update";
    case "scraping": return "Updating library";
    case "normalizing": return "Preparing new creatives";
    case "enriching": return "Checking recent observations";
    case "deep_queued": return "Continuing library update";
    case "deep": return "Indexing more creatives";
    case "exhausted": return "Library is up to date";
    case "complete": return "Library update complete";
    case "stale": return "Restarting a stalled update";
    case "failed": return "Library update stopped";
    default: return "Updating library";
  }
}

function isActive(job?: Job | null) {
  return Boolean(job && STALE_STATUSES.has(job.status));
}

function visibleMeta(ad: Ad) {
  if (ad.offer) return ad.offer;
  if (ad.productName) return ad.productName;
  if (ad.callToAction) return ad.callToAction;
  if (ad.creatorName) return `Creator: ${ad.creatorName}`;
  return labelize(ad.creativeType);
}

export type AdSpySectionProps = {
  query?: string;
  country?: string;
  platform?: Platform;
  onQueryChange?: (query: string) => void;
  onCountryChange?: (country: string) => void;
  onPlatformChange?: (platform: Platform) => void;
  onResultCountChange?: (count: number) => void;
};

export function AdSpySection({
  query = "",
  country = "IN",
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [input, setInput] = useState(query);
  const [countryInput, setCountryInput] = useState(country.toUpperCase());
  const [mode, setMode] = useState<SearchMode>("advertiser");
  const [suggestions, setSuggestions] = useState<AutocompleteAdvertiser[]>([]);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [languageFilter, setLanguageFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const searchAbortRef = useRef<AbortController | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const liveDiscoveryAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollingJobRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const searchGenerationRef = useRef(0);
  const modalCloseRef = useRef<HTMLButtonElement | null>(null);
  const beforeModalFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
      autocompleteAbortRef.current?.abort();
      liveDiscoveryAbortRef.current?.abort();
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    };
  }, []);


  useEffect(() => {
    onResultCountChange?.(total);
  }, [onResultCountChange, total]);

  const filteredAds = useMemo(() => {
    switch (filter) {
      case "active": return ads.filter((ad) => ad.isActive === true);
      case "video": return ads.filter((ad) => ad.creativeType?.toLowerCase().includes("video"));
      case "image": return ads.filter((ad) => ad.creativeType?.toLowerCase().includes("image"));
      case "carousel": return ads.filter((ad) => ad.creativeType?.toLowerCase().includes("carousel"));
      case "creator": return ads.filter((ad) => Boolean(ad.creatorName));
      case "longest": return [...ads].sort((a, b) => Number(b.runningDays ?? 0) - Number(a.runningDays ?? 0));
      default: return ads;
    }
  }, [ads, filter]);

  const announce = useCallback((value: string) => {
    setAnnouncement(value);
    window.setTimeout(() => setAnnouncement(""), 1800);
  }, []);

  const setQuery = useCallback((value: string) => {
    setInput(value);
    onQueryChange?.(value);
  }, [onQueryChange]);

  const loadSearch = useCallback(async (
    nextPage = 1,
    options?: {
      silent?: boolean;
      prefetch?: boolean;
      overrideQuery?: string;
      overridePageId?: string | null;
      overrideFilter?: FilterId;
      overrideLanguage?: string;
      overrideRegion?: string;
    },
  ) => {
    const q = (options?.overrideQuery ?? input).trim();
    const pageId = options?.overridePageId !== undefined ? options.overridePageId : selectedPageId;
    const activeFilter = options?.overrideFilter ?? filter;
    const activeLanguage = options?.overrideLanguage ?? languageFilter;
    const activeRegion = options?.overrideRegion ?? regionFilter;
    const c = countryInput.trim().toUpperCase() || "IN";
    if (q.length < 2) {
      if (!options?.prefetch) {
        setAds([]);
        setTotal(0);
        setTotalPages(0);
        setSummary(EMPTY);
        setIntelligence(null);
        setJob(null);
      }
      return null;
    }

    const key = searchKey({
      query: q,
      country: c,
      platform,
      mode,
      pageId,
      page: nextPage,
      filter: activeFilter,
      language: activeLanguage,
      region: activeRegion,
    });
    const cached = cacheGet<SearchResponse>(searchCache as Map<string, { expiresAt: number; [key: string]: unknown }>, key, "response");
    if (cached) {
      if (!options?.prefetch) {
        setAds(cached.ads ?? []);
        setTotal(Number(cached.total ?? 0));
        setPage(Number(cached.page ?? nextPage));
        setTotalPages(Number(cached.totalPages ?? 0));
        setSummary(cached.summary ?? EMPTY);
        setIntelligence(cached.intelligence ?? null);
        setJob(cached.collectionJob ?? null);
        setRefreshing(Boolean(cached.isRefreshing || isActive(cached.collectionJob)));
        setUpdatedAt(cached.lastUpdatedAt ?? null);
      }
      return cached;
    }

    const generation = ++searchGenerationRef.current;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    if (!options?.silent && !options?.prefetch) setLoading(true);
    setError("");

    try {
      const url = new URL("/api/ad-intelligence/search", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("country", c);
      url.searchParams.set("mode", mode);
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (pageId && platform === "meta" && mode === "advertiser") url.searchParams.set("pageId", pageId);
      if (activeLanguage.trim()) url.searchParams.set("language", activeLanguage.trim());
      if (activeRegion.trim()) url.searchParams.set("region", activeRegion.trim());
      if (activeFilter === "active") url.searchParams.set("activeStatus", "active");
      if (activeFilter === "video" || activeFilter === "image" || activeFilter === "carousel") {
        url.searchParams.set("creativeType", activeFilter);
      }

      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      const data = (await response.json()) as SearchResponse;
      if (!response.ok || !data.success) throw new Error(data.error || "Search failed.");
      if (!mountedRef.current || generation !== searchGenerationRef.current) return data;

      cacheWrite(searchCache as Map<string, { expiresAt: number; [key: string]: unknown }>, key, data, "response", SEARCH_CACHE_TTL_MS, SEARCH_CACHE_MAX);

      if (!options?.prefetch) {
        setAds(data.ads ?? []);
        setTotal(Number(data.total ?? 0));
        setPage(Number(data.page ?? nextPage));
        setTotalPages(Number(data.totalPages ?? 0));
        setSummary(data.summary ?? EMPTY);
        setIntelligence(data.intelligence ?? null);
        setJob(data.collectionJob ?? null);
        setRefreshing(Boolean(data.isRefreshing || isActive(data.collectionJob)));
        setUpdatedAt(data.lastUpdatedAt ?? null);
        // Page 2 is loaded on explicit pagination; avoid recursive search callbacks.
      }
      return data;
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === "AbortError") return null;
      if (mountedRef.current && generation === searchGenerationRef.current && !options?.prefetch) {
        setError(searchError instanceof Error ? searchError.message : "Search failed.");
      }
      return null;
    } finally {
      if (mountedRef.current && generation === searchGenerationRef.current && !options?.silent && !options?.prefetch) setLoading(false);
    }
  }, [countryInput, filter, input, languageFilter, mode, platform, regionFilter, selectedPageId]);

  const loadSuggestions = useCallback(async (queryValue: string) => {
    const q = queryValue.trim();
    if (q.length < 1 || mode !== "advertiser") {
      setSuggestions([]);
      setSuggestionOpen(false);
      return;
    }

    const normalizedCountry = countryInput.trim().toUpperCase() || "IN";
    const normalizedQuery = q.toLocaleLowerCase();
    const key = `${platform}|${normalizedCountry}|${normalizedQuery}`;

    // Show the nearest cached parent prefix immediately while the exact
    // query is fetched. This keeps the dropdown alive between keystrokes.
    for (let length = normalizedQuery.length - 1; length >= 1; length -= 1) {
      const parentKey = `${platform}|${normalizedCountry}|${normalizedQuery.slice(0, length)}`;
      const warm = cacheGet<AutocompleteAdvertiser[]>(
        autocompleteCache as Map<string, { expiresAt: number; [key: string]: unknown }>,
        parentKey,
        "advertisers",
      );

      if (warm) {
        setSuggestions(warm);
        setSuggestionOpen(warm.length > 0);
        setActiveSuggestion(0);
        break;
      }
    }

    const cached = cacheGet<AutocompleteAdvertiser[]>(
      autocompleteCache as Map<string, { expiresAt: number; [key: string]: unknown }>,
      key,
      "advertisers",
    );
    if (cached) {
      setSuggestions(cached);
      setSuggestionOpen(cached.length > 0);
      setActiveSuggestion(0);
      return;
    }

    autocompleteAbortRef.current?.abort();
    const controller = new AbortController();
    autocompleteAbortRef.current = controller;
    setAutocompleteLoading(true);

    const requested = q.toLocaleLowerCase();
    try {
      const url = new URL("/api/ad-intelligence/autocomplete", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN");
      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
      const data = (await response.json()) as { success: boolean; advertisers?: AutocompleteAdvertiser[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Advertiser lookup failed.");
      if (!mountedRef.current || controller.signal.aborted || input.trim().toLocaleLowerCase() !== requested) return;

      const advertisers = data.advertisers ?? [];
      cacheWrite(autocompleteCache as Map<string, { expiresAt: number; [key: string]: unknown }>, key, advertisers, "advertisers", AUTOCOMPLETE_CACHE_TTL_MS, AUTOCOMPLETE_CACHE_MAX);
      setSuggestions(advertisers);
      setSuggestionOpen(advertisers.length > 0);
      setActiveSuggestion(0);
    } catch (autocompleteError) {
      if (!(autocompleteError instanceof DOMException && autocompleteError.name === "AbortError")) {
        setSuggestions([]);
        setSuggestionOpen(false);
      }
    } finally {
      if (mountedRef.current) setAutocompleteLoading(false);
    }
  }, [countryInput, input, mode, platform]);

  useEffect(() => {
    if (mode !== "advertiser") return;

    const timer = window.setTimeout(
      () => void loadSuggestions(input),
      AUTOCOMPLETE_DEBOUNCE_MS,
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    input,
    loadSuggestions,
    mode,
  ]);

  const startRefresh = useCallback(async (overrideQuery?: string, overridePageId?: string | null) => {
    const q = (overrideQuery ?? input).trim();
    if (q.length < 2) return null;
    try {
      const url = new URL("/api/ad-intelligence/refresh", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("country", countryInput.trim().toUpperCase() || "IN");
      url.searchParams.set("mode", mode);
      const pageId = overridePageId !== undefined ? overridePageId : selectedPageId;
      if (pageId && platform === "meta" && mode === "advertiser") url.searchParams.set("pageId", pageId);

      const response = await fetch(url, { method: "POST", cache: "no-store", headers: { Accept: "application/json" } });
      const data = (await response.json()) as { success: boolean; job?: Job; error?: string };
      if (!response.ok || !data.success || !data.job) throw new Error(data.error || "Could not start library update.");
      setJob(data.job);
      setRefreshing(isActive(data.job));
      return data.job;
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not start library update.");
      return null;
    }
  }, [countryInput, input, mode, platform, selectedPageId]);

  const pollJob = useCallback((jobId: string) => {
    if (pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;
    let delay = POLL_START_MS;
    let lastProgress = -1;

    const step = async () => {
      if (!mountedRef.current || pollingJobRef.current !== jobId) return;
      try {
        const response = await fetch(`/api/ad-intelligence/search/status/${encodeURIComponent(jobId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
        const data = (await response.json()) as { success: boolean; job?: Job & { stale?: boolean; hasMore?: boolean }; error?: string };
        if (!response.ok || !data.success || !data.job) throw new Error(data.error || "Collection status unavailable.");

        const nextJob = data.job;
        if (nextJob.id !== pollingJobRef.current) return;
        setJob(nextJob);
        setRefreshing(isActive(nextJob));

        const progress = Number(nextJob.persistedAds ?? 0) * 100_000 + Number(nextJob.discoveredAds ?? 0);
        if (progress !== lastProgress) {
          lastProgress = progress;
          delay = POLL_START_MS;
          void loadSearch(page, { silent: true, overrideQuery: submittedQuery, overridePageId: selectedPageId });
        } else {
          delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.35));
        }

        if (nextJob.stale) {
          pollingJobRef.current = null;
          setRefreshing(false);
          setError(
            "The collection became stale. Use Refresh dataset to start a new collection."
          );
          return;
        }

        if (TERMINAL_STATUSES.has(nextJob.status)) {
          pollingJobRef.current = null;
          setRefreshing(false);
          void loadSearch(page, { silent: true, overrideQuery: submittedQuery, overridePageId: selectedPageId });
          return;
        }
      } catch (pollError) {
        if (mountedRef.current) setError(pollError instanceof Error ? pollError.message : "Collection status unavailable.");
      }
      if (mountedRef.current && pollingJobRef.current === jobId) {
        pollTimerRef.current = window.setTimeout(() => void step(), delay);
      }
    };

    void step();
  }, [loadSearch, page, selectedPageId, startRefresh, submittedQuery]);

  useEffect(() => {
    if (job?.id && isActive(job)) pollJob(job.id);
  }, [job, pollJob]);

  const submit = useCallback(async (overrideQuery?: string, overridePageId?: string | null) => {
    const q = (overrideQuery ?? input).trim();
    const pageId = overridePageId !== undefined ? overridePageId : selectedPageId;

    if (q.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }

    setSubmittedQuery(q);
    setPage(1);
    setSelectedPageId(pageId ?? null);
    setSuggestionOpen(false);
    setError("");

    announce("Searching the indexed creative library");

    const result = await loadSearch(1, {
      overrideQuery: q,
      overridePageId: pageId,
    });

    /*
     * CPU SAFETY BOUNDARY
     *
     * Search always hits the indexed database first.
     * No Playwright call occurs from typing/autocomplete.
     *
     * Collection starts only when:
     *   1. the user explicitly submitted the search, AND
     *   2. the indexed search returned zero creatives.
     *
     * Selecting an already-indexed advertiser therefore never
     * creates a redundant collection job.
     */
    const hasServerFilters = Boolean(
      languageFilter.trim()
      || regionFilter.trim()
      || filter === "active"
      || filter === "video"
      || filter === "image"
      || filter === "carousel"
    );

    if (result && Number(result.total ?? 0) === 0 && !hasServerFilters) {
      announce("No indexed creatives found. Starting a bounded collection.");

      const refreshed = await startRefresh(q, pageId);

      if (refreshed?.id) {
        setJob(refreshed);
        setRefreshing(isActive(refreshed));

        if (isActive(refreshed)) {
          pollJob(refreshed.id);
        }
      }
    } else if (result?.collectionJob) {
      setJob(result.collectionJob);
      setRefreshing(isActive(result.collectionJob));

      if (isActive(result.collectionJob)) {
        pollJob(result.collectionJob.id);
      }
    }
  }, [announce, filter, input, languageFilter, loadSearch, pollJob, regionFilter, selectedPageId, startRefresh]);
  const selectAdvertiser = useCallback((advertiser: AutocompleteAdvertiser) => {
    setQuery(advertiser.label);
    setSelectedPageId(advertiser.pageId);
    setSubmittedQuery(advertiser.label);
    setSuggestions([]);
    setSuggestionOpen(false);
    setActiveSuggestion(0);
    announce(`${advertiser.label} selected`);
    void submit(advertiser.label, advertiser.pageId);
  }, [announce, setQuery, submit]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!suggestionOpen) return;
      setActiveSuggestion((current) => Math.min(current + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSuggestionOpen(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionOpen && suggestions[activeSuggestion]) {
        selectAdvertiser(suggestions[activeSuggestion]);
      } else {
        void submit();
      }
    }
  }, [activeSuggestion, selectAdvertiser, submit, suggestionOpen, suggestions]);

  const openAd = useCallback((ad: Ad) => {
    beforeModalFocusedRef.current = document.activeElement as HTMLElement | null;
    setSelectedAd(ad);
  }, []);

  useEffect(() => {
    if (!selectedAd) {
      window.dispatchEvent(
        new CustomEvent("zooptrack:zwirk-entity", {
          detail: null,
        })
      );
      return;
    }

    window.dispatchEvent(
      new CustomEvent("zooptrack:zwirk-entity", {
        detail: {
          type: "ad",
          id: selectedAd.id ?? null,
          name:
            selectedAd.advertiserName ??
            "Selected creative",
          payload: selectedAd,
        },
      })
    );

    modalCloseRef.current?.focus();
    const previous = beforeModalFocusedRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedAd(null);
        previous?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const modal = document.querySelector<HTMLElement>("[data-adspy-modal]");
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedAd]);

  const currentPage = page;
  const firstResult = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(total, currentPage * PAGE_SIZE);

  return (
    <section className="adspy-shell">
      <div className="adspy-field" aria-hidden="true">
        <span className="adspy-field-grid" />
        <span className="adspy-field-node adspy-field-node-a" />
        <span className="adspy-field-node adspy-field-node-b" />
        <span className="adspy-field-node adspy-field-node-c" />
      </div>

      <div className="adspy-content">
        <header className="adspy-hero">
          <div className="adspy-eyebrow"><span className="adspy-eyebrow-dot" /> Competitive intelligence</div>
          <div className="adspy-hero-row">
            <div>
              <h1>See what this advertiser has been testing.</h1>
              <p>Find real public creatives, watch the library build over time, and inspect the evidence behind each signal.</p>
            </div>
            <div className="adspy-spatial-orbit" aria-hidden="true">
              <span className="orbit-ring orbit-ring-one" />
              <span className="orbit-ring orbit-ring-two" />
              <span className="orbit-core"><Activity size={20} /></span>
            </div>
          </div>
        </header>

        <div className="adspy-search-wrap">
          <div className="adspy-searchbar" role="search">
            <Search size={17} aria-hidden="true" />
            <div className="adspy-input-stack">
              <input
                value={input}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  if (selectedPageId && value.trim() !== submittedQuery.trim()) setSelectedPageId(null);
                  setSuggestionOpen(mode === "advertiser" && value.trim().length > 0);
                }}
                onFocus={() => suggestions.length > 0 && setSuggestionOpen(true)}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionOpen}
                aria-controls="adspy-suggestions"
                aria-activedescendant={suggestionOpen && suggestions[activeSuggestion] ? `adspy-suggestion-${activeSuggestion}` : undefined}
                placeholder={mode === "advertiser" ? "Search advertiser" : "Search keyword"}
                autoComplete="off"
              />
              {selectedPageId && mode === "advertiser" && <span className="adspy-exact-chip"><Check size={11} /> Page ID selected</span>}
            </div>

            <label className="adspy-country">
              <span className="sr-only">Country</span>
              <select value={countryInput} onChange={(event) => { const value = event.target.value.toUpperCase(); setCountryInput(value); onCountryChange?.(value); setSelectedPageId(null); }}>
                <option value="IN">IN</option>
                <option value="US">US</option>
                <option value="GB">GB</option>
                <option value="AE">AE</option>
                <option value="AU">AU</option>
                <option value="CA">CA</option>
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>

            <select className="adspy-mode" value={mode} onChange={(event) => { const nextMode = event.target.value as SearchMode; setMode(nextMode); setSelectedPageId(null); setSuggestions([]); setSuggestionOpen(false); }} aria-label="Search mode">
              <option value="advertiser">Advertiser</option>
              <option value="keyword">Keyword</option>
            </select>

            <button className="adspy-primary-button" type="button" onClick={() => void submit()} disabled={loading}>
              {loading ? <Loader2 size={15} className="adspy-spin" /> : <Search size={15} />}
              Search
            </button>

            {suggestionOpen && mode === "advertiser" && (
              <div className="adspy-suggestions" id="adspy-suggestions" role="listbox" aria-label="Advertisers">
                {autocompleteLoading && suggestions.length === 0 && <div className="adspy-suggestion-loading"><Loader2 size={14} className="adspy-spin" /> Finding advertisers</div>}
                {suggestions.map((suggestion, index) => (
                  <button
                    type="button"
                    key={`${suggestion.pageId}-${suggestion.label}`}
                    id={`adspy-suggestion-${index}`}
                    role="option"
                    aria-selected={index === activeSuggestion}
                    className={`adspy-suggestion ${index === activeSuggestion ? "active" : ""}`}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    onClick={() => selectAdvertiser(suggestion)}
                  >
                    {suggestion.profileImageUrl ? <img src={suggestion.profileImageUrl} alt="" loading="lazy" /> : <span className="adspy-avatar-fallback">{suggestion.label.slice(0, 1).toUpperCase()}</span>}
                    <span className="adspy-suggestion-main">
                      <strong>{suggestion.label}</strong>
                      <span>{suggestion.category ?? "Advertiser"}{suggestion.igFollowers ? ` Â· ${formatNumber(suggestion.igFollowers)} followers` : ""}</span>
                    </span>
                    <span className="adspy-suggestion-source">{suggestion.source === "meta_public" ? "Meta" : "Indexed"}</span>
                  </button>
                ))}
                {!autocompleteLoading && suggestions.length === 0 && (
                  <div className="adspy-suggestion-empty" role="status">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Search size={14} />
                      <span>No indexed advertiser found for "{input.trim()}".</span>
                    </div>
                    <button
                      type="button"
                      className="adspy-secondary-button"
                      onClick={() => {
                        setSuggestionOpen(false);
                        void submit();
                      }}
                    >
                      Search & collect
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="adspy-status-row" aria-live="polite">
          <div className="adspy-status-copy">
            {refreshing && <><span className="adspy-status-dot" />{statusCopy(job?.status)}</>}
            {!refreshing && submittedQuery && updatedAt && <>Last observed {formatDate(updatedAt)}</>}
            {!refreshing && !submittedQuery && <>Search indexed public observations</>}
          </div>
          {refreshing && job && <div className="adspy-progress">{job.persistedAds.toLocaleString("en-IN")} indexed Â· {job.discoveredAds.toLocaleString("en-IN")} discovered</div>}
        </div>

        {error && (
          <div className="adspy-alert" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button>
          </div>
        )}

        {submittedQuery && (
          <>
                        {selectedPageId && platform === "meta" && mode === "advertiser" ? (
              <AdvertiserIntelligenceCard
                pageId={selectedPageId}
                country={countryInput.trim().toUpperCase() || "IN"}
              />
            ) : null}

<div className="adspy-results-head">
              <div>
                <span className="adspy-results-kicker">{selectedPageId ? "Exact Meta advertiser" : mode === "keyword" ? "Keyword search" : "Indexed advertiser search"}</span>
                <h2>{submittedQuery}</h2>
              </div>
              <div className="adspy-result-count">{total ? `${firstResult.toLocaleString("en-IN")}-${lastResult.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}` : "No indexed creatives yet"}</div>
            </div>

            <section className="adspy-intelligence" aria-label="Competitive intelligence">
              <div className="adspy-section-heading"><div><span className="adspy-results-kicker">Evidence layer</span><h2>What the observed library says</h2></div><span className="adspy-evidence-chip"><Activity size={13} /> {summary.totalAds.toLocaleString("en-IN")} observed creatives</span></div>
              <div className="adspy-stat-grid">
                <div><span>Active</span><strong>{summary.activeAds.toLocaleString("en-IN")}</strong><small>{summary.videoAds.toLocaleString("en-IN")} video</small></div>
                <div><span>Average running</span><strong>{summary.averageRunningDays.toFixed(1)}d</strong><small>Longest {summary.longestRunningDays}d</small></div>
                <div><span>Creators</span><strong>{summary.creatorAds.toLocaleString("en-IN")}</strong><small>{summary.carouselAds.toLocaleString("en-IN")} carousel</small></div>
                <div><span>Formats</span><strong>{summary.videoAds + summary.imageAds + summary.carouselAds}</strong><small>{summary.imageAds.toLocaleString("en-IN")} image</small></div>
              </div>
              <div className="adspy-intelligence-grid">
                <div className="adspy-intelligence-panel"><div className="adspy-panel-title"><History size={15} /> Messaging patterns</div>{intelligence?.topHooks?.length ? <div className="adspy-chip-list">{intelligence.topHooks.slice(0, 5).map((item) => <span key={item.label}>{item.label} <b>{item.count}</b></span>)}</div> : <p>Not enough observed text evidence yet.</p>}</div>
                <div className="adspy-intelligence-panel"><div className="adspy-panel-title"><Clock3 size={15} /> Persistence</div><p>{intelligence?.longestRunningAd?.headline ? <><strong>{intelligence.longestRunningAd.headline}</strong><br />{intelligence.longestRunningAd.runningDays ?? summary.longestRunningDays} days observed.</> : "Historical duration appears once enough observations have accumulated."}</p></div>
                <div className="adspy-intelligence-panel"><div className="adspy-panel-title"><UserRound size={15} /> Creators</div>{intelligence?.topCreators?.length ? <div className="adspy-chip-list">{intelligence.topCreators.slice(0, 5).map((item) => <span key={item.label}>{item.label} <b>{item.count}</b></span>)}</div> : <p>No creator pattern is established in the indexed evidence.</p>}</div>
                <div className="adspy-intelligence-panel"><div className="adspy-panel-title"><CircleAlert size={15} /> Performance data</div><p>Public Meta sources used here do not provide reliable per-ad reach, CTR, spend or ROAS. Those fields stay unavailable rather than being inferred.</p></div>
              </div>
            </section>

<div className="adspy-filter-row" aria-label="Creative filters">
              {([
                ["all", "All"],
                ["active", "Active"],
                ["video", "Video"],
                ["image", "Image"],
                ["carousel", "Carousel"],
                ["creator", "Creators"],
                ["longest", "Longest running"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={filter === id ? "active" : ""}
                  onClick={() => {
                    setFilter(id);
                    setPage(1);
                    if (submittedQuery.trim()) {
                      void loadSearch(1, {
                        overrideQuery: submittedQuery,
                        overridePageId: selectedPageId,
                        overrideFilter: id,
                        overrideLanguage: languageFilter,
                        overrideRegion: regionFilter,
                      });
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="adspy-filter-row" aria-label="Language and region filters">
              <select
                className="adspy-mode"
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
                aria-label="Language filter"
              >
                <option value="">All languages</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="hinglish">Hinglish</option>
                <option value="bn">Bengali</option>
                <option value="gu">Gujarati</option>
                <option value="pa">Punjabi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="kn">Kannada</option>
                <option value="ml">Malayalam</option>
              </select>

              <input
                className="adspy-mode"
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value.slice(0, 100))}
                placeholder="Region / state / city"
                aria-label="Region, state, or city filter"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && submittedQuery.trim()) {
                    event.preventDefault();
                    setPage(1);
                    void loadSearch(1, {
                      overrideQuery: submittedQuery,
                      overridePageId: selectedPageId,
                      overrideFilter: filter,
                      overrideLanguage: languageFilter,
                      overrideRegion: regionFilter,
                    });
                  }
                }}
              />

              <button
                type="button"
                className="adspy-secondary-button"
                disabled={!submittedQuery.trim() || loading}
                onClick={() => {
                  setPage(1);
                  void loadSearch(1, {
                    overrideQuery: submittedQuery,
                    overridePageId: selectedPageId,
                    overrideFilter: filter,
                    overrideLanguage: languageFilter,
                    overrideRegion: regionFilter,
                  });
                }}
              >
                Apply filters
              </button>
            </div>

            {loading ? (
              <div className="adspy-grid adspy-skeleton-grid" aria-label="Loading indexed creatives">
                {Array.from({ length: 8 }).map((_, index) => <div className="adspy-card-skeleton" key={index}><div className="adspy-skeleton-media" /><div className="adspy-skeleton-line wide" /><div className="adspy-skeleton-line" /></div>)}
              </div>
            ) : filteredAds.length ? (
              <div className="adspy-grid">
                {filteredAds.map((ad) => {
                  const media = ad.thumbnailUrl ?? ad.imageUrl;
                  const sourceUrl = safeExternalUrl(ad.sourceUrl);
                  return (
                    <article className="adspy-card" key={`${ad.platform}-${ad.id}`} onClick={() => openAd(ad)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAd(ad); } }}>
                      <div className="adspy-card-media">
                        {media ? <img src={media} alt="" loading="lazy" decoding="async" /> : <div className="adspy-no-media"><ImageIcon size={24} /></div>}
                        <span className={`adspy-active-badge ${ad.isActive === true ? "active" : ad.isActive === false ? "inactive" : "unknown"}`}>{ad.isActive === true ? "Active" : ad.isActive === false ? "Inactive" : "Unknown"}</span>
                        {ad.creativeType?.toLowerCase().includes("video") && <span className="adspy-media-badge"><Video size={12} /> Video</span>}
                        {ad.creativeType?.toLowerCase().includes("carousel") && <span className="adspy-media-badge"><ImageIcon size={12} /> Carousel</span>}
                        <button type="button" className="adspy-inspect-float" onClick={(event) => { event.stopPropagation(); openAd(ad); }} aria-label={`Inspect ${ad.advertiserName ?? "creative"}`}><ArrowUpRight size={15} /></button>
                      </div>
                      <div className="adspy-card-body">
                        <div className="adspy-card-advertiser"><span>{ad.advertiserName ?? "Unknown advertiser"}</span>{ad.advertiserId && <span className="adspy-pageid">Meta Â· {ad.advertiserId}</span>}</div>
                        <div className="adspy-card-meta"><span>{labelize(ad.creativeType)}</span><span>First seen {formatDate(ad.firstSeen)}</span></div>
                        <div className="adspy-card-footer"><span>{ad.runningDays ? `${ad.runningDays} day${ad.runningDays === 1 ? "" : "s"} running` : "Duration unavailable"}</span>{visibleMeta(ad) && <span className="adspy-card-offer">{visibleMeta(ad)}</span>}</div>
                        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className="adspy-source-link" onClick={(event) => event.stopPropagation()}><ExternalLink size={12} /> Source</a>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="adspy-empty">
                <Sparkles size={21} />
                <h3>Nothing indexed for this advertiser yet.</h3>
                <p>Existing observations appear immediately. New public creatives will join the library as they are collected.</p>
              </div>
            )}

            <div className="adspy-pagination">
              <span>25 creatives per page</span>
              <div className="adspy-pagination-controls">
                <button type="button" onClick={() => { const next = Math.max(1, page - 1); setPage(next); void loadSearch(next, { overrideQuery: submittedQuery, overridePageId: selectedPageId }); }} disabled={page <= 1}><ChevronLeft size={15} /> Previous</button>
                <span>Page {page}{totalPages ? ` of ${totalPages}` : ""}</span>
                <button type="button" onClick={() => { const next = page + 1; setPage(next); void loadSearch(next, { overrideQuery: submittedQuery, overridePageId: selectedPageId }); }} disabled={totalPages > 0 ? page >= totalPages : ads.length < PAGE_SIZE}><span>Next</span><ChevronRight size={15} /></button>
              </div>
            </div>


          </>
        )}
      </div>

      <div className="sr-only" aria-live="polite">{announcement}</div>

      {selectedAd && (
        <div className="adspy-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAd(null); }}>
          <div className="adspy-modal" role="dialog" aria-modal="true" aria-labelledby="adspy-modal-title" data-adspy-modal>
            <div className="adspy-modal-head">
              <div><span className="adspy-results-kicker">Creative evidence</span><h2 id="adspy-modal-title">{selectedAd.advertiserName ?? "Unknown advertiser"}</h2></div>
              <button ref={modalCloseRef} type="button" className="adspy-icon-button" aria-label="Close inspect dialog" title="Close" onClick={() => { setSelectedAd(null); beforeModalFocusedRef.current?.focus(); }}><X size={17} /></button>
            </div>
            <div className="adspy-modal-body">
              <div className="adspy-modal-media">
                {selectedAd.videoUrl ? <video controls playsInline preload="metadata" poster={selectedAd.thumbnailUrl ?? selectedAd.imageUrl ?? undefined} src={safeExternalUrl(selectedAd.videoUrl) ?? undefined} /> : selectedAd.imageUrl ? <img src={selectedAd.imageUrl} alt="" /> : <div className="adspy-no-media large"><ImageIcon size={28} /></div>}
              </div>
              <div className="adspy-evidence-grid">
                <div><span>Meta Page ID</span><strong>{selectedAd.advertiserId ?? "Not publicly available"}</strong></div>
                <div><span>Creative type</span><strong>{labelize(selectedAd.creativeType)}</strong></div>
                <div><span>Status</span><strong>{selectedAd.isActive === true ? "Active" : selectedAd.isActive === false ? "Inactive" : "Not publicly available"}</strong></div>
                <div><span>First seen</span><strong>{formatDate(selectedAd.firstSeen)}</strong></div>
                <div><span>Last seen</span><strong>{formatDate(selectedAd.lastSeen)}</strong></div>
                <div><span>Running duration</span><strong>{selectedAd.runningDays ? `${selectedAd.runningDays} days` : "Not publicly available"}</strong></div>
                <div><span>Creator</span><strong>{selectedAd.creatorName ?? "Not publicly available"}</strong></div>
                <div><span>Offer</span><strong>{selectedAd.offer ?? "Not publicly available"}</strong></div>
              </div>
              <div className="adspy-evidence-copy"><span>Primary text</span><p>{selectedAd.primaryText ?? "Not publicly available"}</p></div>
              <div className="adspy-evidence-copy"><span>Headline</span><p>{selectedAd.headline ?? "Not publicly available"}</p></div>
              <div className="adspy-evidence-copy"><span>CTA</span><p>{selectedAd.callToAction ?? "Not publicly available"}</p></div>
              <div className="adspy-evidence-copy"><span>Markets</span><p>{selectedAd.markets?.length ? selectedAd.markets.map((market) => market.countryName ?? market.countryCode ?? "Unknown").join(" Â· ") : "Not publicly available"}</p></div>
              <div className="adspy-evidence-copy"><span>Languages</span><p>{selectedAd.languages?.length ? selectedAd.languages.map((language) => language.name).join(" Â· ") : "Not publicly available"}</p></div>
              <div className="adspy-evidence-copy"><span>Provenance</span><pre>{JSON.stringify(selectedAd.dataProvenance ?? {}, null, 2)}</pre></div>
              <div className="adspy-modal-actions">
                <button
                  type="button"
                  className="adspy-primary-button"
                  onClick={() => {
                    const advertiser =
                      selectedAd.advertiserName ??
                      "this advertiser";

                    window.dispatchEvent(
                      new CustomEvent(
                        "zooptrack:ask-zwirk",
                        {
                          detail:
                            `Why might this ${advertiser} ad work, and what should I test differently?`,
                        }
                      )
                    );
                  }}
                >
                  <Sparkles size={14} />
                  Analyze with ZWIRK
                </button>
                {safeExternalUrl(selectedAd.sourceUrl) && <a className="adspy-secondary-button" href={safeExternalUrl(selectedAd.sourceUrl)!} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open source</a>}
                {selectedAd.videoUrl && <span className="adspy-secondary-note"><Play size={13} /> Video evidence loads only when inspected</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdSpySection;

