/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Filter as FilterIcon,
  Globe2,
  History,
  Image as ImageIcon,
  Languages,
  Layers,
  Loader2,
  MapPin,
  MousePointerClick,
  Play,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
  UserRound,
  Video,
  X,
} from "lucide-react";

import type { Ad, AutocompleteAdvertiser, Job, MetaSourceCounts, SearchResponse, Summary } from "./adspy-types";
import { pageChoices, pickExactPage } from "@/lib/ad-intelligence/discovery/pick-page";
import { coveragePercent } from "@/lib/ad-intelligence/global/source-scope";
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilterParams,
  applyTargetParams,
  domainOf,
  formatCompact,
  formatDate,
  formatInt,
  hookOf,
  labelize,
  provenanceOf,
  pushRecent,
  readRecent,
  readUrlState,
  runningLabel,
  safeExternalUrl,
  stateKey,
  statusLabel,
  writeUrlState,
  type FacetBucket,
  type Facets,
  type Filters,
  SORT_OPTIONS,
  type SortKey,
  type RecentItem,
  type SearchTarget,
} from "./workspace-utils";
import { CompareView } from "./CompareView";
import popularBrands from "@/scripts/adspy-seed-brands.json";

const POPULAR: string[] = (popularBrands as { brands: string[] }).brands;

const PAGE_SIZE = 25;
const SUGGEST_DEBOUNCE_MS = 90;
const SUGGEST_CACHE_TTL_MS = 5 * 60_000;
const RESULT_CACHE_TTL_MS = 30_000;
/** An exact advertiser whose newest observation is older than this is re-collected on visit. */
const STALE_AFTER_MS = 24 * 60 * 60_000;
const ACTIVE_JOB = new Set(["queued", "scraping", "normalizing", "enriching", "finalizing", "deep_queued", "deep"]);

const COUNTRIES: Array<[string, string]> = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["AE", "UAE"],
  ["AU", "Australia"],
  ["CA", "Canada"],
  ["SG", "Singapore"],
];

const suggestCache = new Map<string, { at: number; items: AutocompleteAdvertiser[] }>();
const resultCache = new Map<string, { at: number; data: SearchResponse }>();
const facetCache = new Map<string, { at: number; data: Facets | null }>();

function isJobActive(job?: Job | null) {
  return Boolean(job && ACTIVE_JOB.has(job.status));
}

function jobCopy(job: Job | null): string {
  switch (job?.status) {
    case "queued":
      return "Queued — the collector will start in a few seconds";
    case "scraping":
    case "deep":
      return "Reading Meta Ad Library";
    case "normalizing":
    case "enriching":
    case "finalizing":
      return "Organising new creatives";
    default:
      return "Collecting public ads";
  }
}

/* ========================================================================== */

export function AdSpyWorkspace() {
  /* ----------------------------- search box ----------------------------- */
  const [input, setInput] = useState("");
  const [country, setCountry] = useState("IN");
  const [mode, setMode] = useState<"advertiser" | "keyword">("advertiser");
  const [suggestions, setSuggestions] = useState<AutocompleteAdvertiser[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestedFor, setSuggestedFor] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  /* ------------------------------- results ------------------------------ */
  const [target, setTarget] = useState<SearchTarget | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Server-side ordering (whitelisted by the API). Not a filter: facets ignore it.
  const [sort, setSort] = useState<SortKey>("relevant");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [compare, setCompare] = useState<SearchTarget[]>([]);
  // Keep the compare list across reloads in this tab.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("zooptrack.adspy.compare") ?? "[]");
      if (Array.isArray(saved)) setCompare(saved.slice(0, 3));
    } catch {
      // ignore unavailable storage
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("zooptrack.adspy.compare", JSON.stringify(compare));
    } catch {
      // ignore unavailable storage
    }
  }, [compare]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [view, setView] = useState<"ads" | "insights">("ads");
  const [watched, setWatched] = useState<Array<{ pageId: string; name: string; country: string }> | null>(null);
  // Brand-name searches: Meta pages the name could mean, and whether we
  // locked to one automatically (so the user can undo it).
  const [pageOptions, setPageOptions] = useState<AutocompleteAdvertiser[]>([]);
  const [autoLockedFrom, setAutoLockedFrom] = useState<string | null>(null);
  const nameOnly = useRef<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement | null>(null);
  const comboRef = useRef<HTMLDivElement | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const facetAbort = useRef<AbortController | null>(null);
  const warmedUp = useRef(false);
  const autoCollected = useRef<Set<string>>(new Set());
  const pollTimer = useRef<number | null>(null);
  const lastPersisted = useRef(-1);
  const lastBump = useRef(0);
  const resultsTop = useRef<HTMLDivElement | null>(null);

  /* ------------------------- initial URL restore ------------------------ */
  useEffect(() => {
    const state = readUrlState();
    setRecent(readRecent());
    if (state.target) {
      setTarget(state.target);
      setFilters(state.filters);
      setPage(state.page);
      setInput(state.target.query);
      setCountry(state.target.country);
      setMode(state.target.mode);
    }
  }, []);

  useEffect(() => {
    writeUrlState(target, filters, page);
  }, [target, filters, page]);

  // Watched competitors power the landing view and nightly refresh.
  useEffect(() => {
    let alive = true;
    fetch("/api/ad-intelligence/watchlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { success?: boolean; brands?: Array<{ pageId: string; name: string; country: string }> }) => {
        if (alive) setWatched(data.success ? data.brands ?? [] : []);
      })
      .catch(() => alive && setWatched([]));
    return () => {
      alive = false;
    };
  }, []);

  const sameTarget = (a: SearchTarget, b: SearchTarget) =>
    a.country === b.country && (a.pageId && b.pageId ? a.pageId === b.pageId : a.query.toLowerCase() === b.query.toLowerCase());
  const toggleCompare = useCallback((t: SearchTarget) => {
    setCompare((list) => (list.some((x) => sameTarget(x, t)) ? list.filter((x) => !sameTarget(x, t)) : [...list, t].slice(-3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------- suggestions ----------------------------- */
  const warmUp = useCallback(() => {
    if (warmedUp.current) return;
    warmedUp.current = true;
    // Wakes the serverless function + TLS so the first real keystroke is fast.
    void fetch(`/api/ad-intelligence/autocomplete?q=&country=${country}`, { cache: "no-store" }).catch(() => undefined);
  }, [country]);

  useEffect(() => {
    const q = input.trim();
    // Only look up while the user is interacting with the box (not after a
    // suggestion was picked and the input was filled programmatically).
    if (mode !== "advertiser" || !q || !suggestOpen) {
      setSuggestions([]);
      setSuggestedFor("");
      setSuggestLoading(false);
      return;
    }

    const lower = q.toLocaleLowerCase();
    const keyFor = (value: string) => `${country}|${value}`;

    // Instant: exact cache hit, or filter the nearest cached prefix locally.
    const exact = suggestCache.get(keyFor(lower));
    if (exact && Date.now() - exact.at < SUGGEST_CACHE_TTL_MS) {
      setSuggestions(exact.items);
      setSuggestedFor(q);
      setSuggestLoading(false);
      return;
    }
    let shownFromCache = false;
    for (let len = lower.length - 1; len >= 1; len -= 1) {
      const parent = suggestCache.get(keyFor(lower.slice(0, len)));
      if (parent && Date.now() - parent.at < SUGGEST_CACHE_TTL_MS) {
        const filtered = parent.items.filter((s) => s.label.toLocaleLowerCase().includes(lower));
        if (filtered.length) {
          setSuggestions(filtered);
          setSuggestedFor(q);
          shownFromCache = true;
        }
        break;
      }
    }
    // Nothing cached yet: show popular brands instantly while the server answers.
    if (!shownFromCache) {
      const local = POPULAR.filter((name) => name.toLocaleLowerCase().includes(lower))
        .sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(lower)) - Number(!b.toLocaleLowerCase().startsWith(lower)))
        .slice(0, 6)
        .map((name) => ({ source: "indexed", id: `popular-${name}`, pageId: "", label: name, type: "advertiser", category: "Popular D2C brand" }) as AutocompleteAdvertiser);
      if (local.length) {
        setSuggestions(local);
        setSuggestedFor(q);
      }
    }

    setSuggestLoading(true);
    const timer = window.setTimeout(async () => {
      suggestAbort.current?.abort();
      const controller = new AbortController();
      suggestAbort.current = controller;
      try {
        const url = new URL("/api/ad-intelligence/autocomplete", window.location.origin);
        url.searchParams.set("q", q);
        url.searchParams.set("country", country);
        let response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.status >= 500 && !controller.signal.aborted) {
          // Cold function on the first keystroke: retry once instead of showing nothing.
          response = await fetch(url, { cache: "no-store", signal: controller.signal });
        }
        const data = (await response.json().catch(() => ({ success: false }))) as { success: boolean; advertisers?: AutocompleteAdvertiser[] };
        if (controller.signal.aborted) return;
        const items = response.ok && data.success ? data.advertisers ?? [] : [];
        suggestCache.set(keyFor(lower), { at: Date.now(), items });
        setSuggestions(items);
        setSuggestedFor(q);
        setActiveIndex(0);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setSuggestLoading(false);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [country, input, mode, suggestOpen]);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  /* ---------------------------- start search ---------------------------- */
  const go = useCallback((next: SearchTarget) => {
    setView("ads");
    setTarget(next);
    setFilters(NO_FILTERS);
    setPage(1);
    setResult(null);
    setFacets(null);
    setJob(null);
    setNotice("");
    setError("");
    setSuggestOpen(false);
    setPageOptions([]);
    setAutoLockedFrom(null);
    inputRef.current?.blur();
    pushRecent({ label: next.query, pageId: next.pageId, country: next.country, avatar: next.avatar ?? null });
    setRecent(readRecent());
  }, []);

  const pickSuggestion = useCallback(
    (s: AutocompleteAdvertiser) => {
      setInput(s.label);
      go({ query: s.label, pageId: s.pageId || null, mode: "advertiser", country, avatar: s.profileImageUrl ?? null });
    },
    [country, go],
  );

  const submitFreeText = useCallback(() => {
    const q = input.trim();
    if (q.length < 2) {
      setError("Type at least 2 characters.");
      return;
    }
    go({ query: q, pageId: null, mode, country });
  }, [country, go, input, mode]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (suggestOpen && mode === "advertiser" && suggestions[activeIndex] && activeIndex < suggestions.length) {
      pickSuggestion(suggestions[activeIndex]);
    } else {
      submitFreeText();
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length + 1; // + "search all" row
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestOpen(true);
      setActiveIndex((i) => Math.min(i + 1, count - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Escape") {
      setSuggestOpen(false);
    } else if (event.key === "Enter" && suggestOpen && activeIndex === suggestions.length) {
      event.preventDefault();
      submitFreeText();
    }
  };

  /* ------------------------------ fetchers ------------------------------ */
  const key = `${stateKey(target, filters, page)}|${sort}`;
  const facetKey = stateKey(target, filters, 0);

  useEffect(() => {
    if (!target) return;
    const cacheKey = `${key}|v${dataVersion}`;
    const cached = resultCache.get(cacheKey);
    if (cached && Date.now() - cached.at < RESULT_CACHE_TTL_MS) {
      setResult(cached.data);
      setLoading(false);
      return;
    }

    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const silent = dataVersion > 0 && result !== null;
    if (!silent) setLoading(true);
    setError("");

    const url = new URL("/api/ad-intelligence/search", window.location.origin);
    applyTargetParams(url, target);
    applyFilterParams(url, filters);
    if (sort !== "relevant") url.searchParams.set("sort", sort);
    url.searchParams.set("page", String(page));

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as SearchResponse;
        if (!response.ok || !data.success) throw new Error(data.error || "Search failed.");
        resultCache.set(cacheKey, { at: Date.now(), data });
        setResult(data);
        if (data.collectionJob) setJob(data.collectionJob);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Search failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // `result` intentionally omitted: it only decides spinner vs silent refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataVersion]);

  useEffect(() => {
    if (!target) return;
    const cacheKey = `${facetKey}|v${dataVersion}`;
    const cached = facetCache.get(cacheKey);
    if (cached && Date.now() - cached.at < RESULT_CACHE_TTL_MS) {
      setFacets(cached.data);
      return;
    }
    facetAbort.current?.abort();
    const controller = new AbortController();
    facetAbort.current = controller;
    setFacetsLoading(true);

    const url = new URL("/api/ad-intelligence/facets", window.location.origin);
    applyTargetParams(url, target);
    applyFilterParams(url, filters);

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { success: boolean; facets?: Facets | null };
        if (!response.ok || !data.success) throw new Error("facets");
        facetCache.set(cacheKey, { at: Date.now(), data: data.facets ?? null });
        setFacets(data.facets ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setFacetsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey, dataVersion]);

  /* ----------------------------- collection ----------------------------- */
  const startCollection = useCallback(
    async (reason: "auto" | "manual") => {
      if (!target) return;
      setNotice("");
      try {
        const url = new URL("/api/ad-intelligence/refresh", window.location.origin);
        applyTargetParams(url, target);
        const response = await fetch(url, { method: "POST", cache: "no-store" });
        const data = (await response.json()) as {
          success: boolean;
          job?: Job;
          error?: string;
          message?: string | null;
          outcome?: string;
        };
        if (!response.ok || !data.success) throw new Error(data.error || "Could not start collection.");
        if (data.job) setJob(data.job);
        if (data.message) setNotice(data.message);
        else if (reason === "manual" && data.outcome === "dispatched") setNotice("Collecting the latest public ads. New creatives appear here automatically.");
      } catch (reasonError) {
        setError(reasonError instanceof Error ? reasonError.message : "Could not start collection.");
      }
    },
    [target],
  );

  // Collect once per visit when nothing is indexed yet, or when an exact
  // advertiser was last observed more than a day ago (the refresh route
  // enforces its own minimum interval, so this cannot hammer Meta).
  useEffect(() => {
    if (!target || !result || loading) return;
    const baseKey = stateKey(target, NO_FILTERS, 1);
    if (key !== baseKey) return;
    const lastSeen = result.lastUpdatedAt ? Date.parse(result.lastUpdatedAt) : NaN;
    const stale = Boolean(target.pageId) && Number.isFinite(lastSeen) && Date.now() - lastSeen > STALE_AFTER_MS;
    if ((Number(result.total ?? 0) > 0 && !stale) || isJobActive(job)) return;
    if (autoCollected.current.has(baseKey)) return;
    autoCollected.current.add(baseKey);
    void startCollection("auto");
  }, [job, key, loading, result, startCollection, target]);

  // Poll an active collection and refresh results as creatives land.
  useEffect(() => {
    if (!job || !isJobActive(job)) {
      lastPersisted.current = -1;
      return;
    }
    let delay = 1500;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      try {
        const response = await fetch(`/api/ad-intelligence/search/status/${encodeURIComponent(job.id)}`, { cache: "no-store" });
        const data = (await response.json()) as { success: boolean; job?: Job & { stale?: boolean } };
        if (!alive || !data.success || !data.job) return;
        const next = data.job;
        if (next.persistedAds !== lastPersisted.current) {
          lastPersisted.current = next.persistedAds;
          delay = 1500;
          // Refresh results while ads land, but at most every 4 seconds.
          if (next.persistedAds > 0 && Date.now() - lastBump.current > 4000) {
            lastBump.current = Date.now();
            setDataVersion((v) => v + 1);
          }
        } else {
          delay = Math.min(5000, Math.round(delay * 1.4));
        }
        if (next.stale) {
          setJob({ ...next, status: "stale" });
          setNotice("The last collection timed out. Use Refresh data to try again.");
          return;
        }
        setJob(next);
        if (!ACTIVE_JOB.has(next.status)) {
          setDataVersion((v) => v + 1);
          if (next.status === "failed") setNotice(next.errorMessage || "Collection stopped. Try Refresh data again in a few minutes.");
          return;
        }
      } catch {
        delay = Math.min(5000, delay * 2);
      }
      if (alive) pollTimer.current = window.setTimeout(() => void tick(), delay);
    };

    pollTimer.current = window.setTimeout(() => void tick(), delay);
    return () => {
      alive = false;
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    };
    // Re-run only when a different job starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, isJobActive(job)]);

  // Brand NAME search → try to lock to exactly one Meta page. Meta runs a
  // name as a keyword search ("mars" = a resort, a cafe, YouTube…), so a
  // page lock is what makes the numbers comparable with Meta. Re-checked
  // after each collection, because the worker adds newly found pages.
  const collectingNow = isJobActive(job);
  useEffect(() => {
    setPageOptions([]);
    if (!target || target.pageId || target.mode !== "advertiser" || collectingNow) return;
    const q = target.query.trim();
    if (q.length < 2) return;
    const lockKey = `${target.country}|${q.toLocaleLowerCase()}`;
    const controller = new AbortController();
    const url = new URL("/api/ad-intelligence/autocomplete", window.location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("country", target.country);
    // One retry: the first call of a session can hit a cold function (504).
    const lookup = (attempt: number): Promise<{ success?: boolean; advertisers?: AutocompleteAdvertiser[] }> =>
      fetch(url, { cache: "no-store", signal: controller.signal }).then((response) => {
        if (response.ok) return response.json();
        if (attempt === 0 && !controller.signal.aborted) {
          return new Promise((resolve) => window.setTimeout(resolve, 1200)).then(() => lookup(1));
        }
        return { success: false };
      });
    lookup(0)
      .then((data) => {
        if (controller.signal.aborted || !data.success) return;
        const items = (data.advertisers ?? []).filter((item) => /^\d+$/.test(String(item.pageId ?? "")));
        const exact = nameOnly.current.has(lockKey) ? null : pickExactPage(q, items);
        if (exact) {
          setAutoLockedFrom(q);
          setInput(exact.label);
          setTarget((current) =>
            current && !current.pageId && current.query === target.query && current.country === target.country
              ? { ...current, query: exact.label, pageId: exact.pageId, avatar: exact.profileImageUrl ?? current.avatar ?? null }
              : current,
          );
          return;
        }
        setPageOptions(pageChoices(q, items));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [target, collectingNow]);

  const lockToPage = useCallback(
    (option: AutocompleteAdvertiser) => {
      if (!target) return;
      setInput(option.label);
      go({ query: option.label, pageId: option.pageId, mode: "advertiser", country: target.country, avatar: option.profileImageUrl ?? null });
    },
    [go, target],
  );

  const searchNameInstead = useCallback(() => {
    if (!target || !autoLockedFrom) return;
    nameOnly.current.add(`${target.country}|${autoLockedFrom.toLocaleLowerCase()}`);
    setInput(autoLockedFrom);
    go({ query: autoLockedFrom, pageId: null, mode: "advertiser", country: target.country });
  }, [autoLockedFrom, go, target]);

  /* ------------------------------ filters ------------------------------- */
  const setFilter = useCallback(<K extends keyof Filters>(field: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [field]: current[field] === value ? ("" as Filters[K]) : value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(NO_FILTERS);
    setPage(1);
  }, []);

  const goToPage = useCallback((next: number) => {
    setPage(next);
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ------------------------------- derived ------------------------------ */
  const ads = result?.ads ?? [];
  const total = Number(result?.total ?? 0);
  const totalPages = Math.max(0, Number(result?.totalPages ?? Math.ceil(total / PAGE_SIZE)));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(total, page * PAGE_SIZE);
  const collecting = isJobActive(job);
  const filterCount = activeFilterCount(filters);
  const showDropdown =
    suggestOpen && input.trim().length > 0 && (mode === "advertiser" || input.trim().length >= 2);

  // Send the current research context to ZWIRK.
  useEffect(() => {
    if (!target) return;
    window.dispatchEvent(
      new CustomEvent("zooptrack:zwirk-entity", {
        detail: selectedAd
          ? { type: "ad", id: selectedAd.id ?? null, name: selectedAd.advertiserName ?? "Selected creative", payload: selectedAd }
          : {
              type: "advertiser",
              id: target.pageId,
              name: target.query,
              payload: {
                country: target.country,
                filters,
                totalIndexedAds: total,
                summary: result?.summary ?? null,
                intelligence: result?.intelligence ?? null,
                facets: facets
                  ? { language: facets.language.slice(0, 8), format: facets.format, status: facets.status, momentum: facets.momentum }
                  : null,
              },
            },
      }),
    );
  }, [facets, filters, result, selectedAd, target, total]);

  /* ------------------------------- render ------------------------------- */
  return (
    <section className="azs">
      <div className="azs-top">
        <div className={`azs-titlebar ${target ? "" : "is-hero"}`}>
          <div>
            {target ? (
              <h1>AdSpy</h1>
            ) : (
              <>
                <span className="azs-eyebrow">AdSpy · live from Meta Ad Library</span>
                <h1>
                  See what every D2C brand <em>is running right now.</em>
                </h1>
              </>
            )}
            <p>Search a brand to watch every Facebook and Instagram ad it runs — videos, offers, languages and how long each one has been live.</p>
          </div>
        </div>
      </div>

      {/* Direct child of .azs so it can stay pinned while results scroll. */}
      <form className="azs-search" role="search" onSubmit={onSubmit}>
          <div className="azs-combobox" ref={comboRef}>
            <Search size={17} className="azs-search-icon" aria-hidden="true" />
            {target?.pageId && input === target.query && (
              <span className="azs-exact" title={`Meta Page ID ${target.pageId}`}>
                <Check size={11} /> Exact page
              </span>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setSuggestOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => {
                warmUp();
                setSuggestOpen(true);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls="azs-suggestions"
              aria-activedescendant={showDropdown ? `azs-opt-${activeIndex}` : undefined}
              placeholder={mode === "advertiser" ? "Try a brand: Mamaearth, boAt, Minimalist…" : "Search words in ads: \"buy 1 get 1\", \"sunscreen\"…"}
              autoComplete="off"
              spellCheck={false}
            />
            {suggestLoading && <Loader2 size={15} className="azs-spin azs-input-spinner" aria-label="Searching" />}
            {input && (
              <button
                type="button"
                className="azs-clear"
                aria-label="Clear search"
                onClick={() => {
                  setInput("");
                  setSuggestions([]);
                  inputRef.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            )}

            {showDropdown && (
              <div className="azs-dropdown" id="azs-suggestions" role="listbox">
                {mode === "advertiser" && suggestions.length > 0 && (
                  <div className="azs-dropdown-label">Advertisers</div>
                )}
                {mode === "advertiser" &&
                  suggestions.map((s, index) => (
                    <button
                      type="button"
                      role="option"
                      id={`azs-opt-${index}`}
                      aria-selected={activeIndex === index}
                      key={`${s.pageId}-${s.label}`}
                      className={`azs-option ${activeIndex === index ? "is-active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                    >
                      <Avatar src={s.profileImageUrl} label={s.label} />
                      <span className="azs-option-main">
                        <strong>{highlight(s.label, suggestedFor || input)}</strong>
                        <span>
                          {[s.category, s.igFollowers ? `${formatCompact(s.igFollowers)} followers` : null, s.domain]
                            .filter(Boolean)
                            .join(" · ") || `Page ID ${s.pageId}`}
                        </span>
                      </span>
                      {s.verification?.toUpperCase() === "VERIFIED" && <span className="azs-verified">Verified</span>}
                    </button>
                  ))}
                {mode === "advertiser" && !suggestLoading && suggestions.length === 0 && (
                  <div className="azs-dropdown-empty">No indexed advertiser matches yet — search Meta directly below.</div>
                )}
                <button
                  type="button"
                  role="option"
                  id={`azs-opt-${suggestions.length}`}
                  aria-selected={activeIndex === suggestions.length}
                  className={`azs-option azs-option-all ${activeIndex === suggestions.length ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(suggestions.length)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitFreeText}
                >
                  <span className="azs-option-icon">
                    <Search size={15} />
                  </span>
                  <span className="azs-option-main">
                    <strong>
                      {mode === "advertiser" ? "Search all ads for" : "Search ad copy for"} “{input.trim()}”
                    </strong>
                    <span>Uses indexed ads and collects new ones from Meta Ad Library if needed</span>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              </div>
            )}
          </div>

          <label className="azs-select">
            <Globe2 size={14} aria-hidden="true" />
            <span className="sr-only">Country</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="azs-segment" role="radiogroup" aria-label="Search by">
            {(["advertiser", "keyword"] as const).map((value) => (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={mode === value}
                className={mode === value ? "is-on" : ""}
                onClick={() => setMode(value)}
              >
                {value === "advertiser" ? "Brand" : "Keyword"}
              </button>
            ))}
          </div>

          <button type="submit" className="azs-btn azs-btn-primary">
            <Search size={15} /> Search
          </button>
      </form>

      {!target ? (
        <Landing
          recent={recent}
          watched={watched}
          onWatched={(b) => {
            setInput(b.name);
            setCountry(b.country);
            setMode("advertiser");
            go({ query: b.name, pageId: b.pageId, mode: "advertiser", country: b.country });
          }}
          onPick={(item) => {
            setInput(item.label);
            setCountry(item.country);
            setMode("advertiser");
            go({ query: item.label, pageId: item.pageId, mode: "advertiser", country: item.country, avatar: item.avatar });
          }}
          onFocusSearch={() => inputRef.current?.focus()}
          country={country}
          onOpenAd={(ad) => setSelectedAd(ad)}
          onAdvertiser={(ad) => {
            if (!ad.advertiserId || !ad.advertiserName) return;
            setInput(ad.advertiserName);
            setMode("advertiser");
            go({ query: ad.advertiserName, pageId: ad.advertiserId, mode: "advertiser", country });
          }}
        />
      ) : (
        <div className="azs-main">
          <AdvertiserHeader
            target={target}
            total={result ? total : null}
            lastUpdatedAt={result?.lastUpdatedAt ?? null}
            collecting={collecting}
            sampleAd={ads[0] ?? null}
            onRefresh={() => void startCollection("manual")}
            inCompare={compare.some((x) => sameTarget(x, target))}
            onCompare={() => toggleCompare(target)}
            metaSource={result?.metaSource ?? null}
            activeIndexed={result?.summary?.activeAds ?? null}
            filtered={filterCount > 0}
            pageOptions={pageOptions}
            onPickPage={lockToPage}
            autoLockedFrom={autoLockedFrom}
            onSearchName={searchNameInstead}
          />

          {collecting && (
            <div className="azs-banner azs-banner-live" role="status">
              <Loader2 size={15} className="azs-spin" />
              <div>
                <strong>{jobCopy(job)}</strong>
                <span>
                  {job && job.persistedAds > 0
                    ? `${formatInt(job.persistedAds)} creatives saved so far — they appear below as they land.`
                    : "Usually 20–60 seconds. You can keep browsing; results update automatically."}
                </span>
              </div>
            </div>
          )}
          {notice && !collecting && (
            <div className="azs-banner" role="status">
              <CircleAlert size={15} />
              <span>{notice}</span>
              <button type="button" className="azs-icon-btn" aria-label="Dismiss" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="azs-banner azs-banner-error" role="alert">
              <CircleAlert size={15} />
              <span>{error}</span>
              <button type="button" className="azs-icon-btn" aria-label="Dismiss" onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}

          <StatStrip summary={result?.summary ?? null} facets={facets} loading={loading && !result} />

          <div className="azs-tabs" role="tablist" aria-label="Results view">
            <button type="button" role="tab" aria-selected={view === "ads"} className={view === "ads" ? "is-on" : ""} onClick={() => setView("ads")}>
              Ads{total ? <span>{formatInt(total)}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={view === "insights"} className={view === "insights" ? "is-on" : ""} onClick={() => setView("insights")}>
              Insights
            </button>
          </div>

          {view === "insights" && (
            <div className="azs-insights-tab" role="tabpanel">
              <Snapshot summary={result?.summary ?? null} facets={facets} filtered={filterCount > 0} loading={loading && !result} />
              <div className="azs-insights">
                <Momentum facets={facets} loading={facetsLoading && !facets} />
                <Patterns result={result} />
              </div>
            </div>
          )}

          <div className="azs-body" ref={resultsTop} role="tabpanel" style={view === "ads" ? undefined : { display: "none" }}>
            <aside className={`azs-filters ${filtersOpenMobile ? "is-open" : ""}`} aria-label="Filters">
              <div className="azs-filters-head">
                <strong>
                  <FilterIcon size={14} /> Filters
                </strong>
                {filterCount > 0 && (
                  <button type="button" className="azs-link" onClick={clearFilters}>
                    Clear all
                  </button>
                )}
              </div>
              <FacetGroup
                title="Status"
                icon={<Clock3 size={14} />}
                buckets={facets?.status ?? []}
                selected={filters.status}
                loading={facetsLoading && !facets}
                onToggle={(value) => setFilter("status", value as Filters["status"])}
              />
              <FacetGroup
                title="Format"
                icon={<Layers size={14} />}
                buckets={facets?.format ?? []}
                selected={filters.format}
                loading={facetsLoading && !facets}
                onToggle={(value) => setFilter("format", value as Filters["format"])}
              />
              <FacetGroup
                title="Language"
                icon={<Languages size={14} />}
                buckets={facets?.language ?? []}
                selected={filters.language}
                loading={facetsLoading && !facets}
                note="Detected from ad copy"
                collapseAfter={6}
                onToggle={(value) => setFilter("language", value)}
              />
              <FacetGroup
                title="Region"
                icon={<MapPin size={14} />}
                buckets={facets?.region ?? []}
                selected={filters.region}
                loading={facetsLoading && !facets}
                note="Mentioned in the ad or targeting"
                collapseAfter={6}
                onToggle={(value) => setFilter("region", value)}
              />
              {facets?.capped && <p className="azs-fine">Counts cover the first 5,000 matching creatives.</p>}
            </aside>

            <div className="azs-results">
              <div className="azs-results-bar">
                <div>
                  <strong>
                    {loading && !result
                      ? "Loading ads…"
                      : total
                        ? `${formatInt(firstResult)}–${formatInt(lastResult)} of ${formatInt(total)} ads`
                        : collecting
                          ? "Collecting ads…"
                          : "No ads found"}
                  </strong>
                  {loading && result && <Loader2 size={13} className="azs-spin" />}
                </div>
                <label className="azs-sort">
                  <span className="azs-sr-only">Sort ads</span>
                  <select
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as SortKey);
                      setPage(1);
                    }}
                    aria-label="Sort ads"
                  >
                    {SORT_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="azs-btn azs-btn-ghost azs-mobile-only" onClick={() => setFiltersOpenMobile((v) => !v)}>
                  <FilterIcon size={14} /> Filters{filterCount ? ` (${filterCount})` : ""}
                </button>
              </div>

              {filterCount > 0 && (
                <div className="azs-chips" aria-label="Active filters">
                  {filters.status && <Chip label={labelize(filters.status)} onRemove={() => setFilter("status", filters.status)} />}
                  {filters.format && <Chip label={labelize(filters.format)} onRemove={() => setFilter("format", filters.format)} />}
                  {filters.language && (
                    <Chip
                      label={facets?.language.find((l) => l.value === filters.language)?.label ?? filters.language.toUpperCase()}
                      onRemove={() => setFilter("language", filters.language)}
                    />
                  )}
                  {filters.region && <Chip label={labelize(filters.region)} onRemove={() => setFilter("region", filters.region)} />}
                  <button type="button" className="azs-link" onClick={clearFilters}>
                    Clear all
                  </button>
                </div>
              )}

              {loading && !result ? (
                <div className="azs-grid">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div className="azs-card azs-card-skeleton" key={i}>
                      <div className="azs-sk-media" />
                      <div className="azs-sk-line" />
                      <div className="azs-sk-line short" />
                    </div>
                  ))}
                </div>
              ) : ads.length ? (
                <div className={`azs-grid ${loading ? "is-refreshing" : ""}`}>
                  {ads.map((ad) => (
                    <AdCard key={`${ad.platform}-${ad.id}`} ad={ad} onOpen={() => setSelectedAd(ad)} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  collecting={collecting}
                  filtered={filterCount > 0}
                  onClearFilters={clearFilters}
                  onCollect={() => void startCollection("manual")}
                  mode={target.mode}
                />
              )}

              {totalPages > 1 && (
                <nav className="azs-pagination" aria-label="Pages">
                  <button type="button" className="azs-btn azs-btn-ghost" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}>
                    <ChevronLeft size={15} /> Previous
                  </button>
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <button type="button" className="azs-btn azs-btn-ghost" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)}>
                    Next <ChevronRight size={15} />
                  </button>
                </nav>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAd && <AdDetail ad={selectedAd} onClose={() => setSelectedAd(null)} />}

      {compare.length > 0 && !compareOpen && (
        <div className="azs-tray" role="region" aria-label="Brands to compare">
          <span className="azs-tray-label">Compare</span>
          <div className="azs-tray-chips">
            {compare.map((t) => (
              <span className="azs-chip" key={`${t.query}-${t.pageId}`}>
                {t.query}
                <button type="button" aria-label={`Remove ${t.query}`} onClick={() => toggleCompare(t)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            className="azs-btn azs-btn-primary"
            disabled={compare.length < 2}
            onClick={() => setCompareOpen(true)}
            title={compare.length < 2 ? "Add at least 2 brands" : undefined}
          >
            {compare.length < 2 ? "Add 1 more brand" : `Compare ${compare.length}`}
          </button>
        </div>
      )}
      {compareOpen && compare.length > 0 && (
        <CompareView targets={compare} onClose={() => setCompareOpen(false)} onRemove={(t) => toggleCompare(t)} />
      )}
    </section>
  );
}

export default AdSpyWorkspace;

/* ============================== Sub-components ============================== */

function highlight(label: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return label;
  const index = label.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <mark>{label.slice(index, index + q.length)}</mark>
      {label.slice(index + q.length)}
    </>
  );
}

function Avatar({ src, label, size = 34 }: { src?: string | null; label: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="azs-avatar" style={{ width: size, height: size }}>
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initial}
    </span>
  );
}

function SourceCoverage({
  target,
  metaSource,
  total,
  activeIndexed,
  filtered,
  collecting,
}: {
  target: SearchTarget;
  metaSource: MetaSourceCounts | null;
  total: number | null;
  activeIndexed: number | null;
  filtered: boolean;
  collecting: boolean;
}) {
  if (!metaSource || filtered || total === null) return null;
  const active = metaSource.active;
  const all = metaSource.all;
  const observed = [active?.observedAt, all?.observedAt].filter(Boolean).sort().pop() ?? null;
  const when = observed ? ` (checked ${formatDate(observed)})` : "";

  if (metaSource.scopeType === "keyword") {
    const meta = all ?? active;
    if (!meta) return null;
    return (
      <p className="azs-coverage">
        Meta Ad Library reports <strong>{formatInt(meta.total)}</strong> {all ? "" : "active "}ads matching this phrase{when}. Zooptrack has indexed{" "}
        <strong>{formatInt(total)}</strong> of them. Keyword counts on Meta span every advertiser, so use an exact brand for complete coverage.
      </p>
    );
  }

  // Exact page: compare like with like (active vs active, all vs all).
  const liveCoverage = active ? coveragePercent(Number(activeIndexed ?? 0), active.total) : null;
  const allCoverage = all ? coveragePercent(total, all.total) : null;
  const coverage = liveCoverage ?? allCoverage;
  if (coverage === null) return null;
  const low = coverage < 90;
  return (
    <p className={`azs-coverage ${low ? "is-low" : ""}`}>
      {active && (
        <>
          Meta shows <strong>{formatInt(active.total)}</strong> active ads; Zooptrack has <strong>{formatInt(Number(activeIndexed ?? 0))}</strong> of them ({liveCoverage}%).{" "}
        </>
      )}
      {all && (
        <>
          All-time on Meta: <strong>{formatInt(all.total)}</strong>, indexed <strong>{formatInt(total)}</strong>.{" "}
        </>
      )}
      <span className="azs-muted">{when.trim()}</span>
      {low && !collecting && " Use Refresh data to collect the rest."}
    </p>
  );
}

function Landing({
  recent,
  watched,
  onWatched,
  onPick,
  onFocusSearch,
  country,
  onOpenAd,
  onAdvertiser,
}: {
  country: string;
  onOpenAd: (ad: Ad) => void;
  onAdvertiser: (ad: Ad) => void;
  recent: RecentItem[];
  watched: Array<{ pageId: string; name: string; country: string }> | null;
  onWatched: (brand: { pageId: string; name: string; country: string }) => void;
  onPick: (item: RecentItem) => void;
  onFocusSearch: () => void;
}) {
  return (
    <div className="azs-landing">
      {watched && watched.length > 0 ? (
        <section>
          <h2>
            <BookmarkCheck size={15} /> Your competitors
          </h2>
          <div className="azs-recent">
            {watched.map((b) => (
              <button type="button" key={`${b.pageId}-${b.country}`} onClick={() => onWatched(b)}>
                <Avatar label={b.name} size={26} />
                <span>{b.name}</span>
                <small>{b.country}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {recent.length > 0 && (
        <section>
          <h2>
            <History size={15} /> Recent
          </h2>
          <div className="azs-recent">
            {recent.map((item) => (
              <button type="button" key={`${item.label}-${item.pageId}-${item.country}`} onClick={() => onPick(item)}>
                <Avatar src={item.avatar} label={item.label} size={26} />
                <span>{item.label}</span>
                <small>{item.country}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <AdRow
        kind="new"
        title="Just launched"
        subtitle="New ads from Indian D2C brands in the last 3 weeks"
        country={country}
        onOpenAd={onOpenAd}
        onAdvertiser={onAdvertiser}
      />
      <AdRow
        kind="long"
        title="Still running after 60+ days"
        subtitle="Ads brands keep paying for — the ones worth studying"
        country={country}
        onOpenAd={onOpenAd}
        onAdvertiser={onAdvertiser}
      />
      {watched && watched.length === 0 && (
        <section className="azs-onboard">
          <strong>Start by watching your 3 closest competitors</strong>
          <span>Search a brand, pick it from the suggestions and press Watch. We refresh watched brands every night, so their newest ads are waiting for you.</span>
          <button type="button" className="azs-btn azs-btn-primary" onClick={onFocusSearch}>
            <Search size={14} /> Find a competitor
          </button>
        </section>
      )}
    </div>
  );
}

function AdvertiserHeader({
  target,
  total,
  lastUpdatedAt,
  collecting,
  sampleAd,
  onRefresh,
  inCompare,
  onCompare,
  metaSource,
  activeIndexed,
  filtered,
  pageOptions,
  onPickPage,
  autoLockedFrom,
  onSearchName,
}: {
  target: SearchTarget;
  total: number | null;
  lastUpdatedAt: string | null;
  collecting: boolean;
  sampleAd: Ad | null;
  onRefresh: () => void;
  inCompare: boolean;
  onCompare: () => void;
  metaSource: MetaSourceCounts | null;
  activeIndexed: number | null;
  filtered: boolean;
  pageOptions: AutocompleteAdvertiser[];
  onPickPage: (option: AutocompleteAdvertiser) => void;
  autoLockedFrom: string | null;
  onSearchName: () => void;
}) {
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWatching(null);
    if (!target.pageId) return;
    let alive = true;
    fetch(`/api/ad-intelligence/advertiser/${encodeURIComponent(target.pageId)}?country=${target.country}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { success?: boolean; watching?: boolean }) => {
        if (alive && data.success) setWatching(Boolean(data.watching));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [target.country, target.pageId]);

  const toggleWatch = async () => {
    if (!target.pageId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/ad-intelligence/advertiser/${encodeURIComponent(target.pageId)}?country=${target.country}`,
        {
          method: watching ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: target.country }),
        },
      );
      const data = (await response.json()) as { success?: boolean; watching?: boolean };
      if (data.success) setWatching(Boolean(data.watching));
    } finally {
      setBusy(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the address bar already holds the shareable URL.
    }
  };

  const metaUrl = target.pageId
    ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${target.country}&view_all_page_id=${target.pageId}`
    : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${target.country}&q=${encodeURIComponent(target.query)}&search_type=keyword_unordered`;
  const name = target.pageId ? sampleAd?.advertiserName || target.query : target.query;

  return (
    <header
      className="azs-adv"
      style={
        sampleAd?.thumbnailUrl || sampleAd?.imageUrl
          ? ({ ["--azs-hero" as string]: `url("${String(sampleAd.thumbnailUrl ?? sampleAd.imageUrl).replace(/"/g, "%22")}")` } as CSSProperties)
          : undefined
      }
    >
      <Avatar src={target.avatar} label={name} size={52} />
      <div className="azs-adv-main">
        <span className="azs-kicker">
          {target.pageId ? "Exact Meta advertiser" : target.mode === "keyword" ? "Keyword search" : "Brand name search"}
        </span>
        <h2>{name}</h2>
        <div className="azs-adv-meta">
          {target.pageId && <span>Page ID {target.pageId}</span>}
          <span>{COUNTRIES.find(([c]) => c === target.country)?.[1] ?? target.country}</span>
          <span>{total === null ? "Counting ads…" : `${formatInt(total)} ads indexed`}</span>
          {lastUpdatedAt && <span>Updated {formatDate(lastUpdatedAt)}</span>}
        </div>
        <SourceCoverage
          target={target}
          metaSource={metaSource}
          total={total}
          activeIndexed={activeIndexed}
          filtered={filtered}
          collecting={collecting}
        />
        {!target.pageId && target.mode === "advertiser" &&
          (pageOptions.length > 0 ? (
            <div className="azs-lock" role="group" aria-label="Lock to one Meta page">
              <span>Matching by name. Which “{target.query}” do you mean?</span>
              {pageOptions.map((option) => (
                <button key={option.pageId} type="button" className="azs-lock-choice" onClick={() => onPickPage(option)} title={`Meta Page ID ${option.pageId}`}>
                  <Avatar src={option.profileImageUrl} label={option.label} size={20} />
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="azs-fine">
              Matching by name, so other advertisers with a similar name can appear. Meta counts a name as a keyword, so its totals are not comparable here. Pick a suggestion to lock results to one brand’s Meta page.
            </p>
          ))}
        {target.pageId && autoLockedFrom && (
          <p className="azs-fine">
            Locked to the one Meta page that matches “{autoLockedFrom}”.{" "}
            <button type="button" className="azs-link" onClick={onSearchName}>
              Search the name instead
            </button>
          </p>
        )}
      </div>
      <div className="azs-adv-actions">
        {target.pageId && (
          <button type="button" className="azs-btn azs-btn-ghost" onClick={() => void toggleWatch()} disabled={busy || watching === null}>
            {busy ? <Loader2 size={14} className="azs-spin" /> : watching ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {watching ? "Watching" : "Watch"}
          </button>
        )}
        <button type="button" className="azs-btn azs-btn-ghost" onClick={onRefresh} disabled={collecting}>
          <RefreshCw size={14} className={collecting ? "azs-spin" : ""} />
          {collecting ? "Collecting…" : "Refresh data"}
        </button>
        <button type="button" className={`azs-btn azs-btn-ghost ${inCompare ? "is-on" : ""}`} onClick={onCompare} aria-pressed={inCompare}>
          {inCompare ? <Check size={14} /> : <Layers size={14} />}
          {inCompare ? "In compare" : "Compare"}
        </button>
        <button type="button" className="azs-btn azs-btn-ghost" onClick={() => void copyLink()}>
          {copied ? <Check size={14} /> : <Share2 size={14} />}
          {copied ? "Link copied" : "Share"}
        </button>
        {(total ?? 0) > 0 && (
          <button
            type="button"
            className="azs-btn azs-btn-primary"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("zooptrack:ask-zwirk", {
                  detail: `Study ${name}'s Meta ads (${total} indexed, country ${target.country}). Summarise their main hooks, offers, formats and languages, point out the gaps they are not covering, and give me 3 counter-ad concepts to test for my brand (hook, 20-second script outline, offer, format, language).`,
                }),
              )
            }
          >
            <Sparkles size={14} /> Counter-strategy
          </button>
        )}
        <a className="azs-btn azs-btn-ghost" href={metaUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Meta Ad Library
        </a>
      </div>
    </header>
  );
}

function Snapshot({
  summary,
  facets,
  filtered,
  loading,
}: {
  summary: Summary | null;
  facets: Facets | null;
  filtered: boolean;
  loading: boolean;
}) {
  const s = summary;
  const items: Array<{ label: string; value: string; hint?: string }> = [
    { label: filtered ? "Matching ads" : "Ads indexed", value: formatInt(s?.totalAds ?? 0) },
    {
      label: "Active now",
      value: formatInt(s?.activeAds ?? 0),
      hint: s?.totalAds ? `${Math.round(((s.activeAds ?? 0) / s.totalAds) * 100)}% of ads` : undefined,
    },
    {
      label: "Video share",
      value: s?.totalAds ? `${Math.round(((s.videoAds ?? 0) / s.totalAds) * 100)}%` : "–",
      hint: s ? `${formatInt(s.videoAds)} video · ${formatInt(s.imageAds)} image` : undefined,
    },
    {
      label: "Launched in 30 days",
      value: facets ? formatInt(facets.momentum.launched30d) : "–",
      hint: facets ? `${formatInt(facets.momentum.launched7d)} in the last 7 days` : undefined,
    },
    {
      label: "Avg. running time",
      value: s?.averageRunningDays ? `${Math.round(s.averageRunningDays)} days` : "–",
      hint: s?.longestRunningDays ? `Longest ${formatInt(s.longestRunningDays)} days` : undefined,
    },
    { label: "Creator ads", value: formatInt(s?.creatorAds ?? 0), hint: "Partnership / creator posts" },
  ];

  return (
    <div className={`azs-snapshot ${loading ? "is-loading" : ""}`}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{loading ? <span className="azs-sk-inline" /> : item.value}</strong>
          {item.hint && !loading && <small>{item.hint}</small>}
        </div>
      ))}
    </div>
  );
}

function Momentum({ facets, loading }: { facets: Facets | null; loading: boolean }) {
  const weeks = facets?.momentum.weeks ?? [];
  const max = Math.max(1, ...weeks.map((w) => w.launched));
  const totalLaunched = weeks.reduce((sum, w) => sum + w.launched, 0);

  return (
    <section className="azs-panel azs-momentum" aria-label="Launch momentum">
      <div className="azs-panel-head">
        <strong>
          <TrendingUp size={14} /> New ads per week
        </strong>
        <span className="azs-fine">Last 12 weeks · by “started running” date</span>
      </div>
      {loading ? (
        <div className="azs-sk-block" />
      ) : totalLaunched === 0 ? (
        <p className="azs-muted">No launches with a known start date in the last 12 weeks.</p>
      ) : (
        <div className="azs-bars" role="img" aria-label={`${totalLaunched} ads launched in the last 12 weeks`}>
          {weeks.map((w) => (
            <div className="azs-bar" key={w.weekStart} title={`Week of ${formatDate(w.weekStart)}: ${w.launched} new ads`}>
              <span style={{ height: `${Math.max(4, (w.launched / max) * 100)}%` }} className={w.launched ? "" : "is-zero"} />
              <small>{w.launched || ""}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Patterns({ result }: { result: SearchResponse | null }) {
  const intel = result?.intelligence;
  const groups: Array<{ title: string; icon: ReactNode; items: Array<{ label: string; count: number }> }> = [
    { title: "Recurring hooks", icon: <Sparkles size={14} />, items: intel?.topHooks ?? [] },
    {
      title: "Offers",
      icon: <Tag size={14} />,
      // Drop extraction noise such as "53/825"; keep offers with real words, % or ₹.
      items: (intel?.topOffers ?? []).filter((o) => /[a-z]{3,}|%|₹|rs\.?\s?\d/i.test(o.label)),
    },
    { title: "Creators", icon: <UserRound size={14} />, items: intel?.topCreators ?? [] },
  ];
  const hasAny = groups.some((g) => g.items.length > 0);

  return (
    <section className="azs-panel azs-patterns" aria-label="Observed patterns">
      <div className="azs-panel-head">
        <strong>
          <Sparkles size={14} /> What keeps repeating
        </strong>
        <span className="azs-fine">From ad copy of matching ads</span>
      </div>
      {!hasAny ? (
        <p className="azs-muted">Patterns appear once enough ads are indexed.</p>
      ) : (
        <div className="azs-pattern-cols">
          {groups.map((group) => (
            <div key={group.title}>
              <span className="azs-pattern-title">
                {group.icon} {group.title}
              </span>
              {group.items.length ? (
                <ul>
                  {group.items.slice(0, 4).map((item) => (
                    <li key={item.label}>
                      <span title={item.label}>{item.label}</span>
                      <b>{item.count}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="azs-muted">None observed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FacetGroup({
  title,
  icon,
  buckets,
  selected,
  loading,
  note,
  collapseAfter,
  onToggle,
}: {
  title: string;
  icon: ReactNode;
  buckets: FacetBucket[];
  selected: string;
  loading: boolean;
  note?: string;
  collapseAfter?: number;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const limit = collapseAfter && !expanded ? collapseAfter : buckets.length;
  // Always show the selected value even when collapsed.
  const visible = buckets.slice(0, limit);
  if (selected && !visible.some((b) => b.value === selected)) {
    const chosen = buckets.find((b) => b.value === selected);
    visible.push(chosen ?? { value: selected, label: labelize(selected), count: 0 });
  }

  return (
    <div className="azs-facet">
      <div className="azs-facet-title">
        {icon} {title}
      </div>
      {loading ? (
        <div className="azs-sk-lines">
          <span />
          <span />
          <span />
        </div>
      ) : visible.length === 0 ? (
        <span className="azs-muted">No data yet</span>
      ) : (
        <ul>
          {visible.map((bucket) => {
            const on = bucket.value === selected;
            return (
              <li key={bucket.value}>
                <button type="button" className={`azs-facet-row ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => onToggle(bucket.value)}>
                  <span className="azs-facet-check">{on && <Check size={11} />}</span>
                  <span className="azs-facet-label">{bucket.label}</span>
                  <span className="azs-facet-count">{formatInt(bucket.count)}</span>
                  <span className="azs-facet-bar" style={{ width: `${(bucket.count / max) * 100}%` }} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && collapseAfter && buckets.length > collapseAfter && (
        <button type="button" className="azs-link" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show all ${buckets.length}`}
        </button>
      )}
      {note && !loading && buckets.length > 0 && <p className="azs-fine">{note}</p>}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="azs-chip">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>
        <X size={12} />
      </button>
    </span>
  );
}

function AdMedia({ ad, large = false, onFail }: { ad: Ad; large?: boolean; onFail?: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = ad.thumbnailUrl ?? ad.imageUrl ?? null;
  if (!src || failed) {
    return (
      <div className={`azs-no-media ${large ? "is-large" : ""}`}>
        {ad.creativeType === "video" ? <Video size={22} /> : <ImageIcon size={22} />}
        <span>{failed ? "Preview expired on Meta" : "No preview"}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => {
        setFailed(true);
        onFail?.();
      }}
    />
  );
}

function AdCard({
  ad,
  onOpen,
  onAdvertiser,
  hideIfBroken = false,
}: {
  ad: Ad;
  onOpen: () => void;
  onAdvertiser?: () => void;
  hideIfBroken?: boolean;
}) {
  const hook = hookOf(ad);
  const days = Number(ad.runningDays ?? 0);
  const language = ad.languages?.[0]?.name;
  const domain = domainOf(ad.landingPage);
  const [videoBroken, setVideoBroken] = useState(false);
  const [mediaBroken, setMediaBroken] = useState(false);
  const video = ad.creativeType === "video" && !videoBroken ? safeExternalUrl(ad.videoUrl) : null;
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const since = shortDate(ad.firstSeen);
  const name = ad.advertiserName ?? "Unknown advertiser";

  const play = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().then(() => setPlaying(true)).catch(() => undefined);
  }, []);
  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, []);

  // Videos play silently while they are on screen, like a social feed.
  useEffect(() => {
    if (!video || !cardRef.current || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && entry.intersectionRatio >= 0.6 ? play() : pause()),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [video, play, pause]);

  if (hideIfBroken && mediaBroken) return null;

  return (
    <article
      ref={cardRef}
      className="azs-card"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`azs-card-media ${playing ? "is-playing" : ""}`}>
        <AdMedia ad={ad} onFail={() => setMediaBroken(true)} />
        {video && (
          <video
            ref={videoRef}
            className="azs-card-video"
            src={video}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            onError={() => setVideoBroken(true)}
          />
        )}
        {ad.creativeType === "video" && !playing && (
          <span className="azs-play" aria-hidden="true">
            <Play size={16} />
          </span>
        )}
        {days > 0 && (
          <span className={`azs-days ${days >= 60 ? "is-long" : ""}`} title={days >= 60 ? "Running for 60+ days — usually worth studying. Meta does not publish spend or results." : undefined}>
            {days >= 60 ? `Running ${days} days` : `${days}d live`}
          </span>
        )}
        {ad.creativeType === "carousel" && (
          <span className="azs-format">
            <Layers size={11} /> Carousel
          </span>
        )}
        <div className="azs-card-overlay">
          <span className="azs-post-avatar" aria-hidden="true">
            {name.trim().slice(0, 1).toUpperCase()}
          </span>
          <span className="azs-post-who">
            {onAdvertiser ? (
              <button
                type="button"
                className="azs-post-name"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdvertiser();
                }}
              >
                {name}
              </button>
            ) : (
              <strong className="azs-post-name">{name}</strong>
            )}
            <small>
              {ad.isActive === false ? "Stopped" : "Live"}
              {since ? ` · since ${since}` : ""}
            </small>
          </span>
        </div>
      </div>

      <div className="azs-card-text">
        <p className={`azs-post-copy ${hook ? "" : "is-empty"}`}>{hook ?? "No ad text captured"}</p>
        {(ad.headline || ad.callToAction || domain) && (
          <div className="azs-post-cta">
            <div>
              {ad.headline && <strong>{ad.headline}</strong>}
              {domain && <small>{domain}</small>}
            </div>
            {ad.callToAction && <span className="azs-post-button">{ad.callToAction}</span>}
          </div>
        )}
        {(ad.offer || language || ad.creatorName) && (
          <div className="azs-card-tags">
            {ad.offer && <span className="azs-tag azs-tag-offer">{ad.offer}</span>}
            {language && <span className="azs-tag">{language}</span>}
            {ad.creatorName && (
              <span className="azs-tag">
                <UserRound size={11} /> {ad.creatorName}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function shortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-IN", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

function StatStrip({ summary, facets, loading }: { summary: Summary | null; facets: Facets | null; loading: boolean }) {
  if (loading) return <div className="azs-strip is-loading"><span className="azs-sk-inline" /><span className="azs-sk-inline" /><span className="azs-sk-inline" /></div>;
  if (!summary || !summary.totalAds) return null;
  const s = summary;
  const items: Array<[string, string]> = [
    [formatInt(s.totalAds), s.totalAds === 1 ? "ad" : "ads"],
    [formatInt(s.activeAds ?? 0), "running now"],
    [`${Math.round(((s.videoAds ?? 0) / s.totalAds) * 100)}%`, "video"],
  ];
  if (facets) items.push([formatInt(facets.momentum.launched30d), "new this month"]);
  if (s.averageRunningDays) items.push([`${Math.round(s.averageRunningDays)} days`, "avg. run"]);
  if (s.longestRunningDays) items.push([`${formatInt(s.longestRunningDays)} days`, "longest run"]);
  return (
    <div className="azs-strip" aria-label="Summary">
      {items.map(([value, label]) => (
        <span key={label}>
          <strong>{value}</strong> {label}
        </span>
      ))}
    </div>
  );
}

function AdRow({
  kind,
  title,
  subtitle,
  country,
  onOpenAd,
  onAdvertiser,
}: {
  kind: "new" | "long";
  title: string;
  subtitle: string;
  country: string;
  onOpenAd: (ad: Ad) => void;
  onAdvertiser: (ad: Ad) => void;
}) {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setAds(null);
    fetch(`/api/ad-intelligence/fresh?country=${country}&kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { success?: boolean; ads?: Ad[] }) => alive && setAds(data.success ? data.ads ?? [] : []))
      .catch(() => alive && setAds([]));
    return () => {
      alive = false;
    };
  }, [country, kind]);

  if (ads && ads.length === 0) return null;
  const scroll = (dir: number) => rowRef.current?.scrollBy({ left: dir * rowRef.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="azs-rowsec" aria-label={title}>
      <div className="azs-rowhead">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="azs-rownav">
          <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scroll(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="azs-row" ref={rowRef}>
        {ads === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <div className="azs-card azs-card-skeleton" key={i}>
                <div className="azs-sk-media" />
                <div className="azs-sk-line" />
              </div>
            ))
          : ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} hideIfBroken onOpen={() => onOpenAd(ad)} onAdvertiser={() => onAdvertiser(ad)} />
            ))}
      </div>
    </section>
  );
}

function Provenance({ value }: { value: string | null }) {
  if (!value) return null;
  const tone =
    value === "provider" ? "source" : value === "derived" ? "derived" : value === "heuristic" ? "heuristic" : value === "requested" ? "derived" : "unavailable";
  const label = tone === "source" ? "Meta" : tone === "derived" ? "Derived" : tone === "heuristic" ? "Heuristic" : "Unavailable";
  return <span className={`azs-prov is-${tone}`}>{label}</span>;
}

function AdDetail({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  const status = statusLabel(ad);
  const source = safeExternalUrl(ad.sourceUrl);
  const landing = safeExternalUrl(ad.landingPage);
  const video = safeExternalUrl(ad.videoUrl);

  const facts: Array<{ label: string; value: string | null; prov?: string | null }> = [
    { label: "Status", value: status.tone === "unknown" ? null : status.label, prov: provenanceOf(ad, "activeStatus") },
    { label: "Started running", value: formatDate(ad.firstSeen), prov: provenanceOf(ad, "firstSeen") },
    { label: "Last seen", value: formatDate(ad.lastSeen), prov: provenanceOf(ad, "lastSeen") },
    { label: "Running time", value: runningLabel(ad), prov: provenanceOf(ad, "runningDays") },
    { label: "Format", value: ad.creativeType && ad.creativeType !== "unknown" ? labelize(ad.creativeType) : null },
    { label: "Platforms", value: ad.publisherPlatforms?.length ? ad.publisherPlatforms.join(", ") : null },
    { label: "Languages", value: ad.languages?.length ? ad.languages.map((l) => l.name).join(", ") : null, prov: provenanceOf(ad, "language") },
    {
      label: "Markets",
      value: ad.markets?.length
        ? Array.from(new Set(ad.markets.map((m) => m.stateName || m.cityName || m.countryName || m.countryCode).filter(Boolean))).join(", ")
        : null,
      prov: provenanceOf(ad, "market"),
    },
    { label: "Creator", value: ad.creatorName ?? null },
    { label: "Meta Page ID", value: ad.advertiserId ?? null, prov: provenanceOf(ad, "advertiserId") },
    { label: "Library ID", value: ad.id ?? null },
  ];

  return (
    <div className="azs-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="azs-modal" role="dialog" aria-modal="true" aria-labelledby="azs-modal-title">
        <div className="azs-modal-head">
          <div>
            <span className="azs-kicker">Ad detail</span>
            <h2 id="azs-modal-title">{ad.advertiserName ?? "Unknown advertiser"}</h2>
          </div>
          <button ref={closeRef} type="button" className="azs-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="azs-modal-body">
          <div className="azs-modal-media">
            {video ? (
              <video controls playsInline preload="metadata" poster={ad.thumbnailUrl ?? ad.imageUrl ?? undefined} src={video} />
            ) : (
              <AdMedia ad={ad} large />
            )}
          </div>
          <div className="azs-modal-info">
            <section>
              <h3>Ad copy</h3>
              <p className="azs-copy">{ad.primaryText || <span className="azs-muted">Not captured</span>}</p>
              {ad.headline && (
                <p>
                  <b>Headline:</b> {ad.headline}
                </p>
              )}
              <div className="azs-card-tags">
                {ad.callToAction && (
                  <span className="azs-tag">
                    <MousePointerClick size={11} /> {ad.callToAction}
                  </span>
                )}
                {ad.offer && <span className="azs-tag azs-tag-offer">{ad.offer}</span>}
                {ad.productName && <span className="azs-tag">{ad.productName}</span>}
                {ad.productPrice != null && (
                  <span className="azs-tag">
                    {ad.currency ?? "INR"} {formatInt(ad.productPrice)}
                  </span>
                )}
              </div>
            </section>
            <section>
              <h3>Evidence</h3>
              <dl className="azs-facts">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.value ?? <span className="azs-muted">Not publicly available</span>}
                      {fact.value && <Provenance value={fact.prov ?? null} />}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="azs-fine">
                Spend, reach, CTR and ROAS are not published by Meta for these ads, so AdSpy never estimates them.
              </p>
            </section>
            <div className="azs-modal-actions">
              <button
                type="button"
                className="azs-btn azs-btn-primary"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("zooptrack:ask-zwirk", {
                      detail: `Break down this ${ad.advertiserName ?? "competitor"} ad: what is the hook, the offer and the angle, and what should I test against it for my brand?`,
                    }),
                  )
                }
              >
                <Sparkles size={14} /> Ask ZWIRK about this ad
              </button>
              {landing && (
                <a className="azs-btn azs-btn-ghost" href={landing} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Landing page
                </a>
              )}
              {source && (
                <a className="azs-btn azs-btn-ghost" href={source} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> View on Meta
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  collecting,
  filtered,
  onClearFilters,
  onCollect,
  mode,
}: {
  collecting: boolean;
  filtered: boolean;
  onClearFilters: () => void;
  onCollect: () => void;
  mode: "advertiser" | "keyword";
}) {
  if (collecting) {
    return (
      <div className="azs-empty">
        <Loader2 size={22} className="azs-spin" />
        <h3>Collecting public ads from Meta</h3>
        <p>New creatives appear here automatically as they are saved. This usually takes under a minute.</p>
      </div>
    );
  }
  if (filtered) {
    return (
      <div className="azs-empty">
        <FilterIcon size={22} />
        <h3>No ads match these filters</h3>
        <p>Try removing a filter — the counts in the filter panel show what is available.</p>
        <button type="button" className="azs-btn azs-btn-ghost" onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <div className="azs-empty">
      <Search size={22} />
      <h3>No ads indexed yet</h3>
      <p>
        {mode === "keyword"
          ? "No indexed ad copy mentions this yet."
          : "This brand hasn’t been collected yet, or it isn’t running ads in this country."}{" "}
        Collect the latest public ads from Meta Ad Library.
      </p>
      <button type="button" className="azs-btn azs-btn-primary" onClick={onCollect}>
        <RefreshCw size={14} /> Collect now
      </button>
    </div>
  );
}
