"use client";

import {
  Activity,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  UserRound,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Platform = "meta" | "google" | "linkedin";
type SearchMode = "advertiser" | "keyword";

type Ad = {
  id: string;
  platform: Platform;
  advertiserName?: string | null;
  advertiserId?: string | null;
  creatorName?: string | null;
  partnershipType?: string | null;
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
  languages?: Array<{ code: string; name: string }>; 
};

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
  domain?: string | null;
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

export type AdSpySectionProps = {
  query: string;
  country: string;
  platform?: Platform;
  onQueryChange: (query: string) => void;
  onCountryChange: (country: string) => void;
  onPlatformChange?: (platform: Platform) => void;
  onResultCountChange?: (count: number) => void;
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

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "carousel", label: "Carousel" },
  { id: "creator", label: "Creators" },
  { id: "longest", label: "Longest running" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncate(value: string | null | undefined, length = 120) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  return normalized.length > length ? `${normalized.slice(0, length).trim()}…` : normalized;
}

function getMediaUrl(ad: Ad) {
  return safeUrl(ad.thumbnailUrl || ad.imageUrl || ad.videoUrl);
}

function getHook(ad: Ad) {
  const text = String(ad.primaryText || ad.headline || "").replace(/\s+/g, " ").trim();
  if (!text) return "No hook detected";
  return truncate(text.split(/[.!?।！？]/)[0] || text, 100);
}

function getHookType(ad: Ad) {
  const text = getHook(ad).toLowerCase();
  if (/(stop|avoid|mistake|problem|pain|tired|struggle)/i.test(text)) return "Problem";
  if (/(save|free|off|₹|rs\.?|buy|deal|offer|limited)/i.test(text)) return "Offer";
  if (/(how|why|secret|truth|discover|revealed|did you know)/i.test(text)) return "Curiosity";
  if (/(before|after|results|review|testimonial|customer)/i.test(text)) return "Proof";
  if (/(get|make|feel|look|grow|reduce|improve|protect)/i.test(text)) return "Benefit";
  return "Product-led";
}

function mediaIcon(type?: string | null) {
  if (type === "video") return <Video size={14} />;
  if (type === "carousel") return <Layers3 size={14} />;
  return <ImageIcon size={14} />;
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function AdCard({ ad, onOpen }: { ad: Ad; onOpen: () => void }) {
  const media = getMediaUrl(ad);
  const active = ad.isActive !== false;
  const sourceUrl = safeUrl(ad.sourceUrl);

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {media ? (
          <img
            src={media}
            alt={ad.headline || ad.productName || ad.advertiserName || "Creative"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center text-slate-300">
            <ImageIcon size={38} strokeWidth={1.4} />
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm backdrop-blur ${active ? "bg-emerald-50/95 text-emerald-700" : "bg-slate-950/85 text-white"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
            {active ? "Active" : "Inactive"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-sm backdrop-blur">
            {mediaIcon(ad.creativeType)} {ad.creativeType || "image"}
          </span>
        </div>
        {ad.creativeType === "video" ? (
          <span className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-slate-950 shadow-lg">
            <Play size={15} fill="currentColor" />
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {ad.advertiserName || "Unknown advertiser"}
            </p>
            <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-slate-950">
              {ad.headline || ad.productName || "Untitled creative"}
            </h3>
          </div>
          {ad.runningDays ? (
            <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
              {ad.runningDays}d
            </span>
          ) : null}
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-600">
          {ad.primaryText || ad.description || "No primary copy captured."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400">First seen</div>
            <div className="mt-1 text-xs font-semibold text-slate-800">{formatDate(ad.firstSeen)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400">CTA</div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-800">{ad.callToAction || "—"}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Sparkles size={14} />
            Creative intelligence
          </button>
          {sourceUrl ? (
            <button
              type="button"
              title="Open Meta Ad Library"
              onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ExternalLink size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AdSpySection({
  query,
  country,
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
}: AdSpySectionProps) {
  const [mode, setMode] = useState<SearchMode>("advertiser");
  const [input, setInput] = useState(query);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [tracked, setTracked] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const requestRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  setInput(query ?? "");
}, [query]);


const fetchSuggestions = useCallback(
  async (value: string) => {
    const trimmed = value.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const url =
        new URL(
          "/api/ad-intelligence/autocomplete",
          window.location.origin,
        );

      url.searchParams.set(
        "q",
        trimmed,
      );

      url.searchParams.set(
        "mode",
        mode,
      );

      const response =
        await fetch(
          url.toString(),
          {
            cache: "no-store",
          },
        );

      if (!response.ok) {
        setSuggestions([]);
        return;
      }

      const data =
        await response.json();

      if (
        data?.success &&
        Array.isArray(
          data.suggestions,
        )
      ) {
        setSuggestions(
          data.suggestions,
        );
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    }
  },
  [mode],
);
useEffect(() => {
  const timer = window.setTimeout(
    () => fetchSuggestions(input),
    300,
  );

  return () =>
    window.clearTimeout(timer);
}, [
  input,
  fetchSuggestions,
]);

  const fetchResults = useCallback(async (page = 1, explicitQuery?: string, explicitMode?: SearchMode) => {
    const q = (explicitQuery ?? input).trim();
    const searchMode = explicitMode ?? mode;
    if (!q) {
      setError("Enter a brand or keyword to search.");
      searchRef.current?.focus();
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    setSuggestionOpen(false);

    try {
      const url = new URL("/api/ad-intelligence/search", window.location.origin);
      url.searchParams.set("q", q);
      url.searchParams.set("country", country.trim().toUpperCase() || "IN");
      url.searchParams.set("platform", platform);
      url.searchParams.set("mode", searchMode);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "24");

      const response = await fetch(url.toString(), { cache: "no-store" });
      const data = await response.json();
      if (requestId !== requestRef.current) return;
      if (!response.ok || !data.success) throw new Error(data.message || data.error || "Search failed.");

      setAds(data.ads ?? []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
      setIntelligence(data.intelligence ?? null);
      setPagination({ page: data.page ?? page, total: data.total ?? 0, totalPages: data.totalPages ?? 0 });
      setJob(data.collectionJob ?? null);
      onQueryChange(q);
      onResultCountChange?.(Number(data.total ?? 0));
    } catch (searchError) {
      if (requestId !== requestRef.current) return;
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [country, input, mode, onQueryChange, onResultCountChange, platform]);

  useEffect(() => {
    if (!job?.id) return;
    const active = ["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(job.status);
    if (!active) return;

    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/ad-intelligence/search/status/${job.id}`, { cache: "no-store" });
        const data = await response.json();
        if (stopped || !data.success) return;
        setJob(data.job);
        if (data.job.status === "complete") void fetchResults(1);
        if (data.job.status === "failed") setError(data.job.errorMessage || "Background collection failed.");
      } catch {
        // Keep the current indexed results if one status poll fails.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2400);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [fetchResults, job?.id, job?.status]);

  const filteredAds = useMemo(() => {
    const list = [...ads];
    if (filter === "active") return list.filter((ad) => ad.isActive !== false);
    if (filter === "video") return list.filter((ad) => ad.creativeType === "video");
    if (filter === "image") return list.filter((ad) => ad.creativeType === "image");
    if (filter === "carousel") return list.filter((ad) => ad.creativeType === "carousel");
    if (filter === "creator") return list.filter((ad) => Boolean(ad.creatorName));
    if (filter === "longest") return list.sort((a, b) => Number(b.runningDays ?? 0) - Number(a.runningDays ?? 0));
    return list;
  }, [ads, filter]);

  const collectionActive = job && ["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(job.status);
  const progress = job?.discoveredAds ? Math.min(100, Math.round((job.persistedAds / Math.max(job.discoveredAds, 1)) * 100)) : 0;

  async function trackCurrentSearch() {
    const q = input.trim();
    if (!q) return;
    try {
      const response = await fetch("/api/ad-intelligence/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, country, platform }),
      });
      if (!response.ok) throw new Error("Unable to track this competitor.");
      setTracked(true);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Unable to track this competitor.");
    }
  }

  function chooseSuggestion(suggestion: Suggestion) {
    const nextMode: SearchMode = suggestion.type === "keyword" ? "keyword" : "advertiser";
    setInput(suggestion.label);
    setMode(nextMode);
    onQueryChange(suggestion.label);
    setSuggestionOpen(false);
    void fetchResults(1, suggestion.label, nextMode);
  }

  return (
    <section className="space-y-8 pb-16">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
        <div className="bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_35%),linear-gradient(135deg,#0f172a,#111827)] px-6 py-8 text-white md:px-8 md:py-10">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ad Intelligence
              </div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Research competitors without losing the signal.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Search indexed public creatives instantly, see what is still running, and let Zooptrack refresh the market in the background.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
              <Activity size={16} className="text-emerald-400" />
              Meta Ad Library · India-first
            </div>
          </div>
        </div>

        <div className="p-5 md:p-6">
          <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_110px_auto]">
            <select
              value={platform}
              onChange={(event) => onPlatformChange?.(event.target.value as Platform)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-950 focus:bg-white"
            >
              <option value="meta">Meta</option>
              <option value="google">Google / YouTube</option>
              <option value="linkedin">LinkedIn</option>
            </select>

            <div className="relative">
              <div className={`flex h-12 items-center rounded-2xl border bg-white px-4 transition ${suggestionOpen ? "border-slate-950 shadow-[0_0_0_4px_rgba(15,23,42,0.04)]" : "border-slate-200"}`}>
                <Search size={18} className="mr-3 shrink-0 text-slate-400" />
                <input
                  ref={searchRef}
                  value={input}
                  onChange={(event) => { setInput(event.target.value); setSuggestionOpen(true); }}
                  onFocus={() => input.trim().length >= 2 && setSuggestionOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void fetchResults(1);
                    if (event.key === "Escape") setSuggestionOpen(false);
                  }}
                  placeholder={mode === "advertiser" ? "Search a brand or advertiser" : "Search a product, hook, offer or keyword"}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400"
                />
                {suggestionLoading ? <Loader2 size={17} className="animate-spin text-slate-400" /> : null}
              </div>

              {suggestionOpen && suggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-[58px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Suggestions</div>
                  {suggestions.slice(0, 8).map((suggestion) => (
                    <button
                      type="button"
                      key={`${suggestion.type}:${suggestion.id}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseSuggestion(suggestion)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700">
                        {suggestion.type === "creator" ? <UserRound size={15} /> : suggestion.type === "keyword" ? <Tag size={15} /> : <Sparkles size={15} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{suggestion.label}</span>
                        <span className="mt-0.5 block text-[11px] capitalize text-slate-400">{suggestion.type}</span>
                      </span>
                      <ArrowUpRight size={14} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <input
              value={country}
              maxLength={2}
              onChange={(event) => onCountryChange(event.target.value.toUpperCase())}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold uppercase text-slate-900 outline-none transition focus:border-slate-950 focus:bg-white"
              aria-label="Country code"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void fetchResults(1)}
                disabled={loading}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>
              <button
                type="button"
                onClick={() => void trackCurrentSearch()}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${tracked ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {tracked ? <Check size={15} /> : <BookmarkPlus size={15} />}
                {tracked ? "Tracked" : "Track"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-slate-400">Search mode</span>
            <button
              type="button"
              onClick={() => setMode("advertiser")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${mode === "advertiser" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              Advertiser
            </button>
            <button
              type="button"
              onClick={() => setMode("keyword")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${mode === "keyword" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              Keyword
            </button>
            <span className="ml-auto text-xs text-slate-400">{pagination.total ? `${pagination.total.toLocaleString()} indexed creatives` : "Search the indexed market"}</span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <X size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">{error}</div>
          <button type="button" onClick={() => setError("")} className="text-rose-500 hover:text-rose-700"><X size={15} /></button>
        </div>
      ) : null}

      {collectionActive ? (
        <div className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/80">
          <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
              <RefreshCw size={18} className="animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Refreshing source data</span>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">Live</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">Existing results remain available while Zooptrack collects new public creatives.</p>
            </div>
            <div className="w-full md:w-44">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500"><span>{job?.stage || "queued"}</span><span>{progress}%</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Indexed" value={summary.totalAds.toLocaleString()} hint="Public creatives in the indexed market" icon={<Sparkles size={17} />} />
        <StatCard label="Active" value={summary.activeAds.toLocaleString()} hint={`${summary.totalAds ? Math.round((summary.activeAds / summary.totalAds) * 100) : 0}% of indexed ads`} icon={<Activity size={17} />} />
        <StatCard label="Video mix" value={summary.videoAds.toLocaleString()} hint={`${summary.totalAds ? Math.round((summary.videoAds / summary.totalAds) * 100) : 0}% of indexed ads`} icon={<Video size={17} />} />
        <StatCard label="Longest running" value={`${summary.longestRunningDays || 0}d`} hint="Observed persistence signal" icon={<Clock3 size={17} />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Creative intelligence</div>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">What keeps showing up?</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500"><Zap size={12} />Derived from observed source data</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              { label: "Top creator", value: intelligence?.topCreators?.[0]?.label || "No creator signal", count: intelligence?.topCreators?.[0]?.count },
              { label: "Top offer", value: intelligence?.topOffers?.[0]?.label || "No offer detected", count: intelligence?.topOffers?.[0]?.count },
              { label: "Top hook", value: intelligence?.topHooks?.[0]?.label || "No hook detected", count: intelligence?.topHooks?.[0]?.count },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{item.value}</div>
                <div className="mt-2 text-[11px] text-slate-500">{item.count ? `${item.count} ads` : "Not enough signal yet"}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"><Clock3 size={13} /> Longest-running creative</div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{intelligence?.longestRunningAd?.headline || "No long-running creative identified yet"}</div>
              <div className="mt-1 text-xs text-slate-500">{intelligence?.longestRunningAd?.advertiserName || "—"} · {intelligence?.longestRunningAd?.runningDays || 0} observed days</div>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"><Activity size={13} /> Performance data</div>
              <div className="mt-3 text-sm font-semibold text-slate-900">Reach and impressions are not exposed reliably by the current public source.</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">Zooptrack ranks persistence and creative repetition without pretending to know competitor conversion metrics.</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] md:p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Market mix</div>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Observed audience signals</h3>
          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Creators</span><span className="text-xs font-semibold text-slate-400">{summary.creatorAds}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950" style={{ width: `${summary.totalAds ? Math.min(100, (summary.creatorAds / summary.totalAds) * 100) : 0}%` }} /></div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Video</span><span className="text-xs font-semibold text-slate-400">{summary.videoAds}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950" style={{ width: `${summary.totalAds ? Math.min(100, (summary.videoAds / summary.totalAds) * 100) : 0}%` }} /></div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Static + carousel</span><span className="text-xs font-semibold text-slate-400">{summary.imageAds + summary.carouselAds}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-950" style={{ width: `${summary.totalAds ? Math.min(100, ((summary.imageAds + summary.carouselAds) / summary.totalAds) * 100) : 0}%` }} /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Creative library</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Research the ads, not the scorecards.</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">{pagination.total.toLocaleString()} indexed</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredAds.length === 0 && !loading ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <Search size={30} className="mx-auto text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-950">No indexed creatives match this view.</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Try another mode, clear the filter, or wait for the background collector to finish.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredAds.map((ad) => <AdCard key={`${ad.platform}:${ad.id}`} ad={ad} onOpen={() => setSelectedAd(ad)} />)}
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button type="button" disabled={loading || pagination.page <= 1} onClick={() => void fetchResults(pagination.page - 1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => void fetchResults(pagination.page + 1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      ) : null}

      {selectedAd ? (
        <div className="fixed inset-0 z-50 bg-slate-950/55 p-0 backdrop-blur-sm md:p-6" onMouseDown={() => setSelectedAd(null)}>
          <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl md:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Creative intelligence</div>
                <div className="mt-1 text-base font-semibold text-slate-950">{selectedAd.advertiserName || "Unknown advertiser"}</div>
              </div>
              <button type="button" onClick={() => setSelectedAd(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={16} /></button>
            </div>
            <div className="space-y-6 p-5 md:p-6">
              <div className="overflow-hidden rounded-2xl bg-slate-100">
                {getMediaUrl(selectedAd) ? <img src={getMediaUrl(selectedAd)!} alt={selectedAd.headline || "Creative"} className="max-h-[420px] w-full object-cover" /> : <div className="grid h-72 place-items-center text-slate-300"><ImageIcon size={48} /></div>}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{selectedAd.isActive === false ? "Inactive" : "Active"}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{selectedAd.creativeType || "image"}</span>
                  {selectedAd.runningDays ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{selectedAd.runningDays} observed days</span> : null}
                </div>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{selectedAd.headline || selectedAd.productName || "Untitled creative"}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedAd.primaryText || selectedAd.description || "No primary copy captured."}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Hook", getHook(selectedAd)],
                  ["Hook pattern", getHookType(selectedAd)],
                  ["Offer", selectedAd.offer || "—"],
                  ["CTA", selectedAd.callToAction || "—"],
                  ["First seen", formatDate(selectedAd.firstSeen)],
                  ["Last seen", formatDate(selectedAd.lastSeen)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Why this matters</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />The hook is classified from the opening copy pattern.</li>
                  {selectedAd.offer ? <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />A visible offer gives the creative a concrete commercial proposition.</li> : null}
                  {selectedAd.creatorName ? <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />A creator signal makes the presentation more native/UGC-like.</li> : null}
                  {(selectedAd.runningDays ?? 0) >= 90 ? <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />Long observed runtime is a persistence signal, not conversion proof.</li> : null}
                </ul>
              </div>

              <div className="flex gap-2">
                {safeUrl(selectedAd.landingPage) ? <button type="button" onClick={() => window.open(safeUrl(selectedAd.landingPage)!, "_blank", "noopener,noreferrer")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ExternalLink size={15} /> Landing page</button> : null}
                {safeUrl(selectedAd.sourceUrl) ? <button type="button" onClick={() => window.open(safeUrl(selectedAd.sourceUrl)!, "_blank", "noopener,noreferrer")} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"><ArrowUpRight size={15} /> Meta Ad Library</button> : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export default AdSpySection;


