"use client";

import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Languages,
  Layers3,
  Loader2,
  type LucideIcon,
  MapPin,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Target,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


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
  videoDurationSeconds?: number | null;
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
  productPrice?: number | null;
  maxPrice?: number | null;
  currency?: string | null;
  offer?: string | null;
  runningDays?: number | null;
  reach?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  ctr?: number | null;
  languages?: Array<{ code: string; name: string; confidence?: number | null }>;
  markets?: Array<{ countryCode?: string | null; countryName?: string | null; stateName?: string | null; cityName?: string | null }>;
  metadata?: Record<string, unknown>;
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
    id: string;
    advertiserName?: string | null;
    headline?: string | null;
    primaryText?: string | null;
    runningDays?: number | null;
    creativeType?: string | null;
    creatorName?: string | null;
  } | null;
  reach: { status: "unavailable"; reason: string };
};

type Job = {
  id: string;
  status: string;
  stage: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  errorMessage?: string | null;
  updatedAt?: string | null;
};

type Suggestion = {
  id: string;
  name: string;
  type: "brand" | "creator" | "keyword";
  domain?: string | null;
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

function safeDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function hookText(ad: Ad) {
  const source = (ad.primaryText || ad.headline || "").replace(/\s+/g, " ").trim();
  if (!source) return "No hook text detected";
  return (source.split(/[.!?。！？]/)[0] || source).slice(0, 120);
}

function hookType(ad: Ad) {
  const text = hookText(ad).toLowerCase();
  if (/(stop|avoid|mistake|problem|pain|suffering|tired|struggle)/i.test(text)) return "Problem / agitation";
  if (/(save|free|off|₹|rs\.?|buy|deal|offer|limited)/i.test(text)) return "Offer / price";
  if (/(how|why|secret|truth|discover|revealed|did you know)/i.test(text)) return "Curiosity";
  if (/(before|after|results|review|testimonial|customer)/i.test(text)) return "Social proof / result";
  if (/(get|make|feel|look|grow|reduce|improve|protect)/i.test(text)) return "Benefit-led";
  return "Product / direct";
}

function whyHook(ad: Ad) {
  const reasons: string[] = [];
  const type = hookType(ad);
  reasons.push(`${type} hook makes the opening message immediately understandable.`);
  if (ad.offer) reasons.push("A visible offer adds a concrete reason to continue evaluating the ad.");
  if (ad.creatorName || ad.partnershipType === "creator") reasons.push("A creator/UGC presentation can make the message feel more native and relatable.");
  if (ad.videoUrl || ad.creativeType === "video") reasons.push("Video gives the hook a chance to deliver context before the viewer reaches the CTA.");
  if ((ad.runningDays ?? 0) >= 90) reasons.push("Long observed runtime is a persistence signal, not proof of conversion performance.");
  return reasons.slice(0, 4);
}

function creativeWhy(ad: Ad) {
  const reasons: string[] = [];
  if ((ad.runningDays ?? 0) >= 90) reasons.push("Observed for an unusually long period in the indexed dataset.");
  if (ad.creatorName) reasons.push("Uses a named creator signal rather than a purely brand-led presentation.");
  if (ad.offer) reasons.push("Contains a concrete commercial offer that can support purchase intent.");
  if (ad.callToAction) reasons.push(`Uses a clear CTA: ${ad.callToAction}.`);
  if (ad.productName) reasons.push(`Makes the product explicit: ${ad.productName}.`);
  return reasons.length ? reasons : ["There is not enough source evidence to explain durability beyond the observed runtime."];
}

function Metric({ icon: Icon, label, value, title }: { icon: LucideIcon; label: string; value: string | number; title?: string }) {
  return (
    <div title={title} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
        <Icon size={17} strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
        <div className="truncate text-sm font-bold text-slate-950">{value}</div>
      </div>
    </div>
  );
}

function AdCard({ ad, onOpen }: { ad: Ad; onOpen: () => void }) {
  const media = safeUrl(ad.thumbnailUrl || ad.imageUrl || ad.videoUrl);
  const sourceUrl = safeUrl(ad.sourceUrl);
  const type = ad.creativeType ?? "unknown";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {media ? (
          <img src={media} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><ImageIcon size={38} /></div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="gap-1 border-0 bg-white/95 text-slate-900 shadow"><CheckCircle2 size={12} />{ad.isActive === false ? "Inactive" : "Active"}</Badge>
          <Badge className="gap-1 border-0 bg-slate-950/90 text-white shadow">
            {type === "video" ? <Video size={12} /> : type === "carousel" ? <Layers3 size={12} /> : <ImageIcon size={12} />}
            {type}
          </Badge>
        </div>
        {type === "video" && <span className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-slate-900 shadow"><Play size={16} fill="currentColor" /></span>}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{ad.advertiserName || "Unknown advertiser"}</div>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-950">{ad.headline || ad.productName || "Untitled creative"}</h3>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{ad.primaryText || ad.description || "No primary copy extracted."}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Running</span><div className="font-bold text-slate-900">{ad.runningDays ? `${ad.runningDays}d` : "—"}</div></div>
          <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">First seen</span><div className="font-bold text-slate-900">{safeDate(ad.firstSeen)}</div></div>
          <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">Creator</span><div className="truncate font-bold text-slate-900">{ad.creatorName || "None detected"}</div></div>
          <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-500">CTA</span><div className="truncate font-bold text-slate-900">{ad.callToAction || "—"}</div></div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(ad.publisherPlatforms ?? []).slice(0, 3).map((platform) => <Badge key={platform} variant="secondary" className="text-[10px]">{platform}</Badge>)}
          {ad.offer && <Badge variant="secondary" className="gap-1 text-[10px]"><Tag size={10} />{ad.offer}</Badge>}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <Button onClick={onOpen} className="flex-1 gap-2"><Sparkles size={14} />View intelligence</Button>
          {sourceUrl && <Button title="Open source ad" onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")} variant="secondary"><ExternalLink size={15} /></Button>}
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
  const [languages, setLanguages] = useState<any[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [error, setError] = useState("");
  const [tracked, setTracked] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => setInput(query), [query]);

  const fetchSuggestions = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`/api/ad-intelligence/autocomplete?q=${encodeURIComponent(value.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (data.success) setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchSuggestions(input), 300);
    return () => window.clearTimeout(timer);
  }, [input, fetchSuggestions]);

  const fetchResults = useCallback(async (page = 1, overrides?: { query?: string; mode?: SearchMode }) => {
    const q = (overrides?.query ?? input).trim();
    const searchMode = overrides?.mode ?? mode;
    if (!q) {
      setError("Enter a brand or keyword.");
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
      url.searchParams.set("limit", "20");

      const response = await fetch(url.toString(), { cache: "no-store" });
      const data = await response.json();
      if (requestId !== requestRef.current) return;
      if (!response.ok || !data.success) throw new Error(data.message || data.error || "Search failed.");

      setAds(data.ads ?? []);
      setSummary(data.summary ?? EMPTY_SUMMARY);
      setIntelligence(data.intelligence ?? null);
      setLanguages(data.languages ?? []);
      setMarkets(data.markets ?? []);
      setPagination({ page: data.page ?? page, total: data.total ?? 0, totalPages: data.totalPages ?? 0 });
      setJob(data.collectionJob ?? null);
      onResultCountChange?.(Number(data.total ?? 0));
      onQueryChange(q);
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
        if (data.job.status === "complete") await fetchResults(1);
        if (data.job.status === "failed") setError(data.job.errorMessage || "Collection failed.");
      } catch {
        // Keep polling; transient polling failures should not break the search UI.
      }
    };

    const timer = window.setInterval(poll, 2500);
    void poll();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [fetchResults, job?.id, job?.status]);

  const collectionProgress = useMemo(() => {
    if (!job) return 0;
    const total = Math.max(job.discoveredAds, 1);
    return Math.min(100, Math.round((job.persistedAds / total) * 100));
  }, [job]);

  const observedLanguages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of languages) {
      const name = row.language_name || row.language_code || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [languages]);

  const observedMarkets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of markets) {
      const name = row.city_name || row.state_name || row.country_name || row.country || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [markets]);

  async function trackCurrentSearch() {
    try {
      await fetch("/api/ad-intelligence/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input.trim(), country, platform }),
      });
      setTracked(true);
    } catch {
      setTracked(false);
    }
  }

  function chooseSuggestion(suggestion: Suggestion) {
    setInput(suggestion.name);
    onQueryChange(suggestion.name);
    setSuggestionOpen(false);
    const nextMode: SearchMode = suggestion.type === "keyword" ? "keyword" : "advertiser";
    setMode(nextMode);
    window.setTimeout(() => {
      void fetchResults(1, { query: suggestion.name, mode: nextMode });
    }, 0);
  }

  return (
    <section className="space-y-6 pb-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Search ads</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 shadow-sm focus-within:border-slate-900">
              <Search size={18} className="shrink-0 text-slate-500" />
              <Input
                value={input}
                onChange={(event) => { setInput(event.target.value); setSuggestionOpen(true); }}
                onFocus={() => setSuggestionOpen(true)}
                onKeyDown={(event) => { if (event.key === "Enter") void fetchResults(1); }}
                placeholder="Search a brand, creator, product or keyword"
                className="border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {suggestionOpen && suggestions.length > 0 && (
              <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                {suggestions.map((suggestion) => (
                  <button key={suggestion.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
                      {suggestion.type === "creator" ? <UserRound size={15} /> : suggestion.type === "keyword" ? <Search size={15} /> : <Target size={15} />}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{suggestion.name}</span><span className="text-xs capitalize text-slate-500">{suggestion.type}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-full lg:w-44">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Search mode</label>
            <select value={mode} onChange={(event) => setMode(event.target.value as SearchMode)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-900">
              <option value="advertiser">Advertiser</option>
              <option value="keyword">Keyword</option>
            </select>
          </div>

          <div className="w-full lg:w-32">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Country</label>
            <Input value={country} onChange={(event) => onCountryChange(event.target.value.toUpperCase())} maxLength={2} className="font-semibold uppercase" />
          </div>

          <Button onClick={() => void fetchResults(1)} disabled={loading} className="h-10 gap-2 lg:w-36">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Source:</span>
          <Badge variant="secondary">Meta Ad Library</Badge>
          <span className="text-xs text-slate-500">Advertiser mode finds the advertiser. Keyword mode finds ads matching the query across ad text and metadata.</span>
          <div className="ml-auto">
            <Button onClick={() => void trackCurrentSearch()} variant="secondary" className="gap-2" disabled={!input.trim()}>
              <Bookmark size={14} />{tracked ? "Tracked" : "Track search"}
            </Button>
          </div>
        </div>
      </div>

      {job && ["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(job.status) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-white"><Loader2 size={17} className="animate-spin" /></span>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold text-slate-950">Updating Zooptrack index</div><div className="text-xs text-slate-500">{job.stage} · {job.persistedAds} persisted · {job.discoveredAds} discovered</div></div>
            <span className="text-sm font-bold text-slate-900">{collectionProgress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${collectionProgress}%` }} /></div>
        </div>
      )}

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><Info size={18} className="mt-0.5 shrink-0" /><div>{error}</div></div>}

      <div>
        <div className="mb-3 flex items-end justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Market snapshot</div><h2 className="mt-1 text-xl font-bold text-slate-950">Research the ads, not the scorecards.</h2></div><div className="text-xs font-semibold text-slate-500">{pagination.total ? `${pagination.total.toLocaleString("en-IN")} indexed ads` : "No indexed results yet"}</div></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Metric icon={BarChart3} label="Indexed" value={summary.totalAds.toLocaleString("en-IN")} />
          <Metric icon={CheckCircle2} label="Active" value={`${summary.activeAds.toLocaleString("en-IN")}`} />
          <Metric icon={ImageIcon} label="Image" value={summary.imageAds} />
          <Metric icon={Video} label="Video" value={summary.videoAds} />
          <Metric icon={Layers3} label="Carousel" value={summary.carouselAds} />
          <Metric icon={UserRound} label="Creators" value={summary.creatorAds} />
          <Metric icon={Clock3} label="Avg running" value={`${summary.averageRunningDays || 0}d`} title="Derived from first/last observed dates." />
          <Metric icon={Target} label="Longest" value={`${summary.longestRunningDays || 0}d`} title="Persistence signal, not proof of conversion performance." />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2"><Sparkles size={17} /><h3 className="font-bold text-slate-950">Competitive creative intelligence</h3></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Top creator</div><div className="mt-1 font-bold text-slate-950">{intelligence?.topCreators?.[0]?.label || "No creator signal"}</div><div className="text-xs text-slate-500">{intelligence?.topCreators?.[0] ? `${intelligence.topCreators[0].count} ads` : "Source data pending"}</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Top offer</div><div className="mt-1 font-bold text-slate-950">{intelligence?.topOffers?.[0]?.label || "No offer detected"}</div><div className="text-xs text-slate-500">{intelligence?.topOffers?.[0] ? `${intelligence.topOffers[0].count} ads` : "Source data pending"}</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Top hook pattern</div><div className="mt-1 line-clamp-2 font-bold text-slate-950">{intelligence?.topHooks?.[0]?.label || "No hook detected"}</div><div className="text-xs text-slate-500">Observed repetition, not conversion proof</div></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Clock3 size={14} />Longest-running creative</div><div className="mt-2 font-bold text-slate-950">{intelligence?.longestRunningAd?.advertiserName || "—"}</div><div className="text-sm text-slate-600">{intelligence?.longestRunningAd?.headline || "No headline"}</div><div className="mt-1 text-xs font-semibold text-slate-500">{intelligence?.longestRunningAd?.runningDays ?? 0} observed days</div></div>
            <div className="rounded-xl border border-dashed border-slate-300 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Info size={14} />Reach / impressions</div><div className="mt-2 font-bold text-slate-950">Unavailable from current public source</div><div className="mt-1 text-xs leading-5 text-slate-500">Zooptrack will not invent reach, impressions or conversion numbers. We can still rank persistence, creative repetition and observed source signals.</div></div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Languages size={17} /><h3 className="font-bold text-slate-950">Language & market signals</h3></div>
          <div className="mt-4 space-y-4">
            <div><div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Languages observed</div>{observedLanguages.length ? observedLanguages.map(([name, count]) => <div key={name} className="mb-2 flex items-center justify-between text-sm"><span>{name}</span><span className="font-bold">{count}</span></div>) : <div className="text-sm text-slate-500">Language data will appear as creatives are enriched.</div>}</div>
            <div><div className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500"><MapPin size={13} />Markets observed</div>{observedMarkets.length ? observedMarkets.map(([name, count]) => <div key={name} className="mb-2 flex items-center justify-between text-sm"><span>{name}</span><span className="font-bold">{count}</span></div>) : <div className="text-sm text-slate-500">City/state targeting is not claimed unless the source exposes it.</div>}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Creative library</div><div className="mt-1 text-sm text-slate-600">Facts come from the public source; explanations below are Zooptrack-derived.</div></div>
        {pagination.totalPages > 1 && <div className="flex items-center gap-2"><Button variant="secondary" disabled={pagination.page <= 1 || loading} onClick={() => void fetchResults(pagination.page - 1)}><ChevronLeft size={16} /></Button><span className="px-2 text-sm font-semibold">{pagination.page} / {pagination.totalPages}</span><Button variant="secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => void fetchResults(pagination.page + 1)}><ChevronRight size={16} /></Button></div>}
      </div>

      {ads.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Search size={32} className="mx-auto text-slate-400" /><h3 className="mt-3 font-bold text-slate-950">No indexed creatives yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Start a search. Zooptrack will collect the public dataset in the background and refresh this view when the collection is complete.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ads.map((ad) => <AdCard key={`${ad.platform}:${ad.id}`} ad={ad} onOpen={() => setSelectedAd(ad)} />)}
        </div>
      )}

      {selectedAd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm md:items-center md:p-6" onMouseDown={() => setSelectedAd(null)}>
          <aside className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Ad intelligence</div><div className="font-bold text-slate-950">{selectedAd.advertiserName || "Unknown advertiser"}</div></div>
              <Button variant="secondary" onClick={() => setSelectedAd(null)}><X size={17} /></Button>
            </div>
            <div className="space-y-6 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Sparkles size={14} />Why this hook?</div><div className="mt-2 font-bold text-slate-950">“{hookText(selectedAd)}”</div><div className="mt-2 text-xs font-semibold text-slate-500">Pattern: {hookType(selectedAd)}</div><ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">{whyHook(selectedAd).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />{reason}</li>)}</ul></div>
                <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Clock3 size={14} />Why may this creative persist?</div><div className="mt-2 font-bold text-slate-950">{selectedAd.runningDays ?? 0} observed days</div><ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">{creativeWhy(selectedAd).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />{reason}</li>)}</ul></div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric icon={Clock3} label="First seen" value={safeDate(selectedAd.firstSeen)} /><Metric icon={RefreshCw} label="Last seen" value={safeDate(selectedAd.lastSeen)} /><Metric icon={Tag} label="Offer" value={selectedAd.offer || "—"} /><Metric icon={Target} label="Reach" value={selectedAd.reach == null ? "Unavailable" : selectedAd.reach} /></div>

              <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Source facts</div><div className="mt-3 grid gap-3 text-sm md:grid-cols-2"><div><span className="text-slate-500">Creative:</span> <b>{selectedAd.creativeType || "unknown"}</b></div><div><span className="text-slate-500">CTA:</span> <b>{selectedAd.callToAction || "—"}</b></div><div><span className="text-slate-500">Creator:</span> <b>{selectedAd.creatorName || "None detected"}</b></div><div><span className="text-slate-500">First seen:</span> <b>{safeDate(selectedAd.firstSeen)}</b></div><div><span className="text-slate-500">Product:</span> <b>{selectedAd.productName || "—"}</b></div><div><span className="text-slate-500">Landing page:</span> <b>{safeUrl(selectedAd.landingPage) ? "Available" : "Unavailable"}</b></div></div></div>

              {safeUrl(selectedAd.landingPage) && <Button variant="secondary" className="w-full gap-2" onClick={() => window.open(safeUrl(selectedAd.landingPage)!, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />Open landing page</Button>}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export default AdSpySection;