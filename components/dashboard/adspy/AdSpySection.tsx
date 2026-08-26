"use client";

import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Check,
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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type Suggestion = {
  id: string;
  label: string;
  type: "advertiser" | "creator" | "keyword";
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
  ["all", "All"],
  ["active", "Active"],
  ["video", "Video"],
  ["image", "Image"],
  ["carousel", "Carousel"],
  ["creator", "Creators"],
  ["longest", "Longest running"],
] as const;

type FilterId = (typeof FILTERS)[number][0];

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function truncate(value?: string | null, size = 150) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "No copy captured from the public source.";
  return text.length > size ? `${text.slice(0, size).trim()}…` : text;
}

function mediaUrl(ad: Ad) {
  return safeUrl(ad.thumbnailUrl || ad.imageUrl || ad.videoUrl);
}

function hook(ad: Ad) {
  const text = String(ad.primaryText || ad.headline || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "No hook detected";

  return (
    text
      .split(/[.!?।！？]/)[0]
      ?.trim()
      .slice(0, 110) || "No hook detected"
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="zt-stat">
      <div className="zt-stat-top">
        <span className="zt-stat-icon">{icon}</span>
        <span className="zt-stat-label">{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function CreativeCard({
  ad,
  onOpen,
}: {
  ad: Ad;
  onOpen: () => void;
}) {
  const image = mediaUrl(ad);
  const source = safeUrl(ad.sourceUrl);
  const active = ad.isActive !== false;
  const type = ad.creativeType || "image";

  return (
    <article className="zt-ad-card">
      <div className="zt-ad-media">
        {image ? (
          <img
            src={image}
            alt={ad.headline || ad.productName || ad.advertiserName || "Creative"}
            loading="lazy"
          />
        ) : (
          <div className="zt-ad-media-empty">
            <ImageIcon size={42} />
            <span>Media unavailable</span>
          </div>
        )}

        <div className="zt-ad-media-top">
          <span className={active ? "zt-pill zt-pill-green" : "zt-pill zt-pill-dark"}>
            <span className="zt-dot" />
            {active ? "Active" : "Inactive"}
          </span>

          <span className="zt-pill zt-pill-glass">
            {type === "video" ? <Video size={13} /> : type === "carousel" ? <Layers3 size={13} /> : <ImageIcon size={13} />}
            {type}
          </span>
        </div>

        {type === "video" ? (
          <span className="zt-play">
            <Play size={16} fill="currentColor" />
          </span>
        ) : null}
      </div>

      <div className="zt-ad-body">
        <div className="zt-ad-brand-row">
          <div>
            <span className="zt-overline">{ad.advertiserName || "Unknown advertiser"}</span>
            <h3>{ad.headline || ad.productName || "Untitled creative"}</h3>
          </div>

          {ad.runningDays ? (
            <span className="zt-age">{ad.runningDays}d</span>
          ) : null}
        </div>

        <p className="zt-ad-copy">
          {truncate(ad.primaryText || ad.description)}
        </p>

        <div className="zt-ad-meta">
          <div>
            <span>First seen</span>
            <strong>{dateLabel(ad.firstSeen)}</strong>
          </div>
          <div>
            <span>CTA</span>
            <strong>{ad.callToAction || "—"}</strong>
          </div>
        </div>

        <div className="zt-ad-actions">
          <button
            type="button"
            className="zt-btn zt-btn-dark"
            onClick={onOpen}
          >
            <Sparkles size={14} />
            Inspect creative
          </button>

          {source ? (
            <button
              type="button"
              className="zt-icon-btn"
              title="Open source"
              onClick={() =>
                window.open(source, "_blank", "noopener,noreferrer")
              }
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
}: AdSpySectionProps) {
  const [input, setInput] = useState(query ?? "");
  const [mode, setMode] = useState<SearchMode>("advertiser");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 0,
  });

  const [filter, setFilter] = useState<FilterId>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [tracked, setTracked] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setInput(query ?? "");
  }, [query]);

  const fetchSuggestions = useCallback(
    async (value: string) => {
      const q = value.trim();

      if (q.length < 2) {
        setSuggestions([]);
        setSuggestionLoading(false);
        return;
      }

      setSuggestionLoading(true);

      try {
        const url = new URL(
          "/api/ad-intelligence/autocomplete",
          window.location.origin,
        );

        url.searchParams.set("q", q);
        url.searchParams.set("mode", mode);

        const response = await fetch(url, {
          cache: "no-store",
        });

        const data = await response.json();

        setSuggestions(
          data?.success && Array.isArray(data.suggestions)
            ? data.suggestions.slice(0, 8)
            : [],
        );
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionLoading(false);
      }
    },
    [mode],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => void fetchSuggestions(input),
      260,
    );

    return () => window.clearTimeout(timer);
  }, [input, fetchSuggestions]);

  const search = useCallback(
    async (page = 1, forcedQuery?: string) => {
      const q = (forcedQuery ?? input).trim();

      if (q.length < 2) {
        setError("Enter at least 2 characters.");
        searchRef.current?.focus();
        return;
      }

      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError("");
      setSuggestionOpen(false);

      try {
        const url = new URL(
          "/api/ad-intelligence/search",
          window.location.origin,
        );

        url.searchParams.set("q", q);
        url.searchParams.set(
          "country",
          country.trim().toUpperCase() || "IN",
        );
        url.searchParams.set("platform", platform);
        url.searchParams.set("mode", mode);
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", "24");

        const response = await fetch(url, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.error || "Search failed.",
          );
        }

        if (requestId !== requestIdRef.current) return;

        setAds(Array.isArray(data.ads) ? data.ads : []);
        setSummary(data.summary ?? EMPTY_SUMMARY);
        setIntelligence(data.intelligence ?? null);
        setJob(data.collectionJob ?? null);
        setPagination({
          page: data.page ?? page,
          total: data.total ?? 0,
          totalPages: data.totalPages ?? 0,
        });

        onQueryChange(q);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "Search failed.",
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [country, input, mode, onQueryChange, platform],
  );

  useEffect(() => {
    if (!query || query.trim().length < 2) return;
    void search(1, query);
    // intentionally only when incoming query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const status = job?.status;

    if (
      !job?.id ||
      !status ||
      !["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(status)
    ) {
      return;
    }

    let cancelled = false;

    const timer = window.setInterval(async () => {
      if (cancelled) return;

      try {
        const response = await fetch(
          `/api/ad-intelligence/search/status/${job.id}`,
          { cache: "no-store" },
        );

        const data = await response.json();

        if (!response.ok || !data?.success) return;

        const nextJob = data.job as Job;

        if (!cancelled) {
          setJob(nextJob);

          if (
            nextJob.persistedAds > 0 ||
            ["complete", "failed"].includes(nextJob.status)
          ) {
            await search(1, input);
          }
        }
      } catch {
        // polling is best effort
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [input, job?.id, job?.status, search]);

  const filteredAds = useMemo(() => {
    const list = [...ads];

    switch (filter) {
      case "active":
        return list.filter((ad) => ad.isActive !== false);
      case "video":
        return list.filter((ad) => ad.creativeType === "video");
      case "image":
        return list.filter((ad) => ad.creativeType === "image");
      case "carousel":
        return list.filter((ad) => ad.creativeType === "carousel");
      case "creator":
        return list.filter(Boolean).filter((ad) => Boolean(ad.creatorName));
      case "longest":
        return list.sort(
          (a, b) => (b.runningDays ?? 0) - (a.runningDays ?? 0),
        );
      default:
        return list;
    }
  }, [ads, filter]);

  const topHook = intelligence?.topHooks?.[0];
  const topOffer = intelligence?.topOffers?.[0];
  const topCreator = intelligence?.topCreators?.[0];

  const applySuggestion = (suggestion: Suggestion) => {
    setInput(suggestion.label);
    onQueryChange(suggestion.label);
    setSuggestionOpen(false);
    void search(1, suggestion.label);
  };

  const trackCurrent = async () => {
    const q = input.trim();
    if (!q) return;

    try {
      const response = await fetch(
        "/api/ad-intelligence/track",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: q,
            country,
            platform,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "Failed to track brand.",
        );
      }

      setTracked(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to track brand.",
      );
    }
  };

  return (
    <>
      <section className="zt-adspy">
        <div className="zt-adspy-hero">
          <div>
            <span className="zt-eyebrow">AD INTELLIGENCE</span>
            <h2>Research competitors without losing the signal.</h2>
            <p>
              Search the indexed public market, see what is running,
              and let Zooptrack keep the dataset fresh in the background.
            </p>
          </div>

          <div className="zt-source-badge">
            <span className="zt-live-dot" />
            Meta Ad Library · India-first
          </div>
        </div>

        <div className="zt-search-panel">
          <div className="zt-search-row">
            <div className="zt-select-wrap">
              <label>Platform</label>
              <select
                value={platform}
                onChange={(event) =>
                  onPlatformChange?.(
                    event.target.value as Platform,
                  )
                }
              >
                <option value="meta">Meta</option>
                <option value="google">Google / YouTube</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>

            <div className="zt-search-wrap">
              <label>Brand or keyword</label>

              <div className="zt-search-field">
                <Search size={18} />
                <input
                  ref={searchRef}
                  value={input}
                  onChange={(event) => {
                    const next = event.target.value;
                    setInput(next);
                    onQueryChange(next);
                    setSuggestionOpen(true);
                  }}
                  onFocus={() => {
                    if (input.trim().length >= 2) {
                      setSuggestionOpen(true);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void search();
                    }

                    if (event.key === "Escape") {
                      setSuggestionOpen(false);
                    }
                  }}
                  placeholder="Search a brand, advertiser or keyword"
                  aria-label="Search a brand, advertiser or keyword"
                />

                {input ? (
                  <button
                    type="button"
                    className="zt-clear"
                    onClick={() => {
                      setInput("");
                      onQueryChange("");
                      setSuggestions([]);
                      setSuggestionOpen(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              {suggestionOpen && input.trim().length >= 2 ? (
                <div className="zt-suggestions">
                  <div className="zt-suggestion-head">
                    <span>Suggestions</span>
                    {suggestionLoading ? (
                      <Loader2 size={14} className="zt-spin" />
                    ) : null}
                  </div>

                  {suggestions.length ? (
                    suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.type}:${suggestion.id}`}
                        type="button"
                        className="zt-suggestion"
                        onMouseDown={(event) =>
                          event.preventDefault()
                        }
                        onClick={() =>
                          applySuggestion(suggestion)
                        }
                      >
                        <span className="zt-suggestion-icon">
                          {suggestion.type === "advertiser" ? (
                            <UserRound size={15} />
                          ) : suggestion.type === "creator" ? (
                            <Sparkles size={15} />
                          ) : (
                            <Tag size={15} />
                          )}
                        </span>
                        <span>
                          <strong>{suggestion.label}</strong>
                          <small>
                            {suggestion.type === "advertiser"
                              ? "Advertiser"
                              : suggestion.type === "creator"
                                ? "Creator"
                                : "Creative keyword"}
                          </small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="zt-suggestion-empty">
                      No matching indexed suggestions.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="zt-country-wrap">
              <label>Country</label>
              <input
                value={country}
                maxLength={2}
                onChange={(event) =>
                  onCountryChange(
                    event.target.value.toUpperCase(),
                  )
                }
              />
            </div>

            <button
              type="button"
              className="zt-search-btn"
              onClick={() => void search()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={16} className="zt-spin" />
              ) : (
                <Search size={16} />
              )}
              {loading ? "Searching" : "Search"}
            </button>

            <button
              type="button"
              className={
                tracked
                  ? "zt-track-btn zt-track-done"
                  : "zt-track-btn"
              }
              onClick={() => void trackCurrent()}
            >
              {tracked ? <Check size={16} /> : <Bookmark size={16} />}
              {tracked ? "Tracked" : "Track"}
            </button>
          </div>

          <div className="zt-mode-row">
            <span>Search mode</span>
            <button
              type="button"
              className={mode === "advertiser" ? "zt-mode active" : "zt-mode"}
              onClick={() => {
                setMode("advertiser");
                setSuggestionOpen(false);
              }}
            >
              Advertiser
            </button>
            <button
              type="button"
              className={mode === "keyword" ? "zt-mode active" : "zt-mode"}
              onClick={() => {
                setMode("keyword");
                setSuggestionOpen(false);
              }}
            >
              Keyword
            </button>
            <span className="zt-mode-help">
              {mode === "advertiser"
                ? "Exact competitor identity first."
                : "Search creative copy, products and metadata."}
            </span>
          </div>

          {job && (
            <div className="zt-job-strip">
              <div className="zt-job-main">
                {job.status === "complete" ? (
                  <Check size={15} />
                ) : (
                  <RefreshCw size={15} className="zt-spin-soft" />
                )}
                <strong>
                  {job.status === "complete"
                    ? "Market refresh complete"
                    : "Refreshing source data"}
                </strong>
                <span>
                  {job.discoveredAds} discovered · {job.persistedAds} indexed
                </span>
              </div>

              <div className="zt-job-progress">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        6,
                        job.discoveredAds
                          ? (job.persistedAds / job.discoveredAds) * 100
                          : 6,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {error ? (
            <div className="zt-error">{error}</div>
          ) : null}
        </div>

        <div className="zt-stats-grid">
          <Stat
            icon={<Activity size={16} />}
            label="Indexed"
            value={summary.totalAds}
            hint="Public creatives in the indexed market"
          />
          <Stat
            icon={<Activity size={16} />}
            label="Active"
            value={summary.activeAds}
            hint={`${summary.totalAds ? Math.round((summary.activeAds / summary.totalAds) * 100) : 0}% of indexed ads`}
          />
          <Stat
            icon={<Video size={16} />}
            label="Video mix"
            value={summary.videoAds}
            hint={`${summary.totalAds ? Math.round((summary.videoAds / summary.totalAds) * 100) : 0}% of indexed ads`}
          />
          <Stat
            icon={<Clock3 size={16} />}
            label="Longest running"
            value={`${summary.longestRunningDays}d`}
            hint="Observed persistence signal"
          />
        </div>

        <div className="zt-insight-grid">
          <section className="zt-panel">
            <div className="zt-panel-head">
              <div>
                <span className="zt-overline">CREATIVE INTELLIGENCE</span>
                <h3>What keeps showing up?</h3>
              </div>
              <span className="zt-derived">
                <Sparkles size={13} />
                Derived from observed source data
              </span>
            </div>

            <div className="zt-insight-cards">
              <div className="zt-insight-card">
                <span>Top creator</span>
                <strong>{topCreator?.label || "No creator signal"}</strong>
                <small>
                  {topCreator
                    ? `${topCreator.count} observed creatives`
                    : "Not enough signal yet"}
                </small>
              </div>

              <div className="zt-insight-card">
                <span>Top offer</span>
                <strong>{topOffer?.label || "No offer detected"}</strong>
                <small>
                  {topOffer
                    ? `${topOffer.count} observed creatives`
                    : "Not enough signal yet"}
                </small>
              </div>

              <div className="zt-insight-card">
                <span>Top hook</span>
                <strong>{topHook?.label || "No hook detected"}</strong>
                <small>
                  {topHook
                    ? `${topHook.count} observed creatives`
                    : "Not enough signal yet"}
                </small>
              </div>
            </div>

            <div className="zt-longest">
              <div>
                <span>Longest-running creative</span>
                <strong>
                  {intelligence?.longestRunningAd?.headline ||
                    "No long-running creative identified yet"}
                </strong>
              </div>
              <span className="zt-longest-days">
                {intelligence?.longestRunningAd?.runningDays ?? 0} observed days
              </span>
            </div>
          </section>

          <section className="zt-panel zt-performance">
            <span className="zt-overline">MARKET MIX</span>
            <h3>Observed audience signals</h3>

            <div className="zt-mix-row">
              <span>Creators</span>
              <strong>{summary.creatorAds}</strong>
            </div>
            <div className="zt-mix-row">
              <span>Video</span>
              <strong>{summary.videoAds}</strong>
            </div>
            <div className="zt-mix-row">
              <span>Static + carousel</span>
              <strong>{summary.imageAds + summary.carouselAds}</strong>
            </div>

            <div className="zt-performance-note">
              Reach and impressions are not exposed reliably by the public source.
              Zooptrack ranks persistence and repetition without inventing conversion metrics.
            </div>
          </section>
        </div>

        <section className="zt-library">
          <div className="zt-library-head">
            <div>
              <span className="zt-overline">CREATIVE LIBRARY</span>
              <h3>Research the ads, not the scorecards.</h3>
            </div>

            <span className="zt-result-count">
              {pagination.total} indexed
            </span>
          </div>

          <div className="zt-filter-row">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "zt-filter active" : "zt-filter"}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && !ads.length ? (
            <div className="zt-library-loading">
              <Loader2 size={30} className="zt-spin" />
              <strong>Loading indexed creatives</strong>
              <span>Fetching the latest public source data.</span>
            </div>
          ) : filteredAds.length ? (
            <div className="zt-ad-grid">
              {filteredAds.map((ad) => (
                <CreativeCard
                  key={`${ad.platform}:${ad.id}`}
                  ad={ad}
                  onOpen={() => setSelectedAd(ad)}
                />
              ))}
            </div>
          ) : (
            <div className="zt-library-empty">
              <div className="zt-empty-icon">
                <Search size={20} />
              </div>
              <strong>
                {job &&
                ["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(job.status)
                  ? "Collecting public creatives"
                  : "No indexed creatives match this view."}
              </strong>
              <span>
                {job &&
                ["queued", "scraping", "normalizing", "enriching", "finalizing"].includes(job.status)
                  ? "Existing results remain available while Zooptrack refreshes the market."
                  : "Try another mode or search term."}
              </span>
            </div>
          )}

          {pagination.totalPages > 1 ? (
            <div className="zt-pagination">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => void search(pagination.page - 1)}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => void search(pagination.page + 1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </section>
      </section>

      {selectedAd ? (
        <div
          className="zt-drawer-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedAd(null)}
        >
          <aside
            className="zt-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Creative intelligence"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="zt-drawer-head">
              <div>
                <span className="zt-overline">CREATIVE INTELLIGENCE</span>
                <h3>{selectedAd.headline || selectedAd.productName || "Creative"}</h3>
              </div>
              <button
                type="button"
                className="zt-icon-btn"
                onClick={() => setSelectedAd(null)}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            {mediaUrl(selectedAd) ? (
              <div className="zt-drawer-media">
                <img
                  src={mediaUrl(selectedAd) as string}
                  alt={selectedAd.headline || "Creative"}
                />
              </div>
            ) : null}

            <div className="zt-drawer-content">
              <div className="zt-drawer-brand">
                {selectedAd.advertiserName || "Unknown advertiser"}
              </div>

              <p className="zt-drawer-copy">
                {selectedAd.primaryText ||
                  selectedAd.description ||
                  "No primary copy captured."}
              </p>

              <div className="zt-detail-grid">
                <div>
                  <span>Hook</span>
                  <strong>{hook(selectedAd)}</strong>
                </div>
                <div>
                  <span>Format</span>
                  <strong>{selectedAd.creativeType || "Unknown"}</strong>
                </div>
                <div>
                  <span>Running</span>
                  <strong>{selectedAd.runningDays ?? 0} days</strong>
                </div>
                <div>
                  <span>CTA</span>
                  <strong>{selectedAd.callToAction || "—"}</strong>
                </div>
                <div>
                  <span>First seen</span>
                  <strong>{dateLabel(selectedAd.firstSeen)}</strong>
                </div>
                <div>
                  <span>Last seen</span>
                  <strong>{dateLabel(selectedAd.lastSeen)}</strong>
                </div>
              </div>

              <div className="zt-drawer-actions">
                {safeUrl(selectedAd.sourceUrl) ? (
                  <a
                    href={safeUrl(selectedAd.sourceUrl) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="zt-btn zt-btn-dark"
                  >
                    Open Ad Library
                    <ArrowUpRight size={14} />
                  </a>
                ) : null}

                {safeUrl(selectedAd.landingPage) ? (
                  <a
                    href={safeUrl(selectedAd.landingPage) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="zt-btn zt-btn-light"
                  >
                    Landing page
                    <ArrowUpRight size={14} />
                  </a>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
