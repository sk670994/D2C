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
import { ProductAnalyzePanel } from "@/components/product-analysis/ProductAnalyzePanel";

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
  reach: {
    status: "unavailable";
    reason: string;
  };
};

type SearchResponse = {
  success: boolean;
  query?: string;
  country?: string;
  platform?: Platform;
  mode?: SearchMode;
  ads?: Ad[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  summary?: Summary;
  intelligence?: Intelligence | null;
  lastUpdatedAt?: string | null;
  isRefreshing?: boolean;
  error?: string;
};

type TrackResponse = {
  success: boolean;
  tracked?: boolean;
  id?: string | null;
  jobId?: string | null;
  dispatched?: boolean;
  lastCollectedAt?: string | null;
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

const ACTIVE_JOB_STATUSES = [
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
];

function isActiveJobStatus(status?: string | null) {
  return Boolean(status && ACTIVE_JOB_STATUSES.includes(status));
}

function dateLabel(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function safeUrl(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function truncate(value?: string | null, size = 150) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "No copy captured from the public source.";
  }

  return text.length > size
    ? `${text.slice(0, size).trim()}…`
    : text;
}

function mediaUrl(ad: Ad) {
  return safeUrl(
    ad.thumbnailUrl ||
      ad.imageUrl ||
      ad.videoUrl,
  );
}

function hook(ad: Ad) {
  const text = String(
    ad.primaryText ||
      ad.headline ||
      "",
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "No hook detected";
  }

  return (
    text
      .split(/[.!?।！？]/)[0]
      ?.trim()
      .slice(0, 110) ||
    "No hook detected"
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
        <span className="zt-stat-icon">
          {icon}
        </span>

        <span className="zt-stat-label">
          {label}
        </span>
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
  const image = safeUrl(
    ad.thumbnailUrl || ad.imageUrl,
  );
  const video = safeUrl(ad.videoUrl);
  const source = safeUrl(ad.sourceUrl);
  const active = ad.isActive !== false;
  const type = ad.creativeType || "image";
  const [playing, setPlaying] = useState(false);

  return (
    <article className="zt-ad-card">
      <div className="zt-ad-media">
        {playing && video ? (
          <video
            key={video}
            src={video}
            poster={image ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onEnded={() => setPlaying(false)}
            onError={() => setPlaying(false)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              background: "#000",
            }}
          />
        ) : image ? (
          <img
            src={image}
            alt={
              ad.headline ||
              ad.productName ||
              ad.advertiserName ||
              "Creative"
            }
            loading="lazy"
          />
        ) : (
          <div className="zt-ad-media-empty">
            <ImageIcon size={42} />
            <span>Media unavailable</span>
          </div>
        )}

        <div className="zt-ad-media-top">
          <span
            className={
              active
                ? "zt-pill zt-pill-green"
                : "zt-pill zt-pill-dark"
            }
          >
            <span className="zt-dot" />
            {active ? "Active" : "Inactive"}
          </span>

          <span className="zt-pill zt-pill-glass">
            {type === "video" ? (
              <Video size={13} />
            ) : type === "carousel" ? (
              <Layers3 size={13} />
            ) : (
              <ImageIcon size={13} />
            )}

            {type}
          </span>
        </div>

        {type === "video" && video && !playing ? (
          <button
            type="button"
            className="zt-play"
            aria-label={`Play video for ${
              ad.advertiserName || "advertiser"
            }`}
            title="Play video"
            onClick={() => setPlaying(true)}
            style={{
              border: 0,
              padding: 0,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Play
              size={16}
              fill="currentColor"
            />
          </button>
        ) : null}

        {playing && video ? (
          <button
            type="button"
            aria-label="Close video"
            title="Close video"
            onClick={() => setPlaying(false)}
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              zIndex: 5,
              width: 34,
              height: 34,
              border: 0,
              borderRadius: "9999px",
              background: "rgba(15,23,42,.85)",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="zt-ad-body">
        <div className="zt-ad-brand-row">
          <div>
            <span className="zt-overline">
              {ad.advertiserName ||
                "Unknown advertiser"}
            </span>

            <h3>
              {ad.headline ||
                ad.productName ||
                "Untitled creative"}
            </h3>
          </div>

          {ad.runningDays ? (
            <span className="zt-age">
              {ad.runningDays}d
            </span>
          ) : null}
        </div>

        <p className="zt-ad-copy">
          {truncate(
            ad.primaryText ||
              ad.description,
          )}
        </p>

        <div className="zt-ad-meta">
          <div>
            <span>First seen</span>
            <strong>
              {dateLabel(ad.firstSeen)}
            </strong>
          </div>

          <div>
            <span>CTA</span>
            <strong>
              {ad.callToAction || "—"}
            </strong>
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
                window.open(
                  source,
                  "_blank",
                  "noopener,noreferrer",
                )
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
export type AdSpySectionProps = {
  query?: string;
  country?: string;
  platform?: Platform;
  onQueryChange?: (query: string) => void;
  onCountryChange?: (country: string) => void;
  onPlatformChange?: (platform: Platform) => void;
  onResultCountChange?: (count: number) => void;
  initialSuggestionCatalog?: Suggestion[];
};

export function AdSpySection({
  query = "",
  country = "IN",
  platform = "meta",
  onQueryChange,
  onCountryChange,
  onPlatformChange,
  onResultCountChange,
  initialSuggestionCatalog = [],
}: AdSpySectionProps) {
  const [input, setInput] = useState(
    query,
  );

  const [countryInput, setCountryInput] =
    useState(country.toUpperCase());

  const [mode, setMode] =
    useState<SearchMode>("advertiser");

  const [suggestions, setSuggestions] =
    useState<Suggestion[]>([]);

  const [suggestionOpen, setSuggestionOpen] =
    useState(false);

  const [suggestionLoading, setSuggestionLoading] =
    useState(false);

  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] =
    useState<Summary>(EMPTY_SUMMARY);

  const [intelligence, setIntelligence] =
    useState<Intelligence | null>(null);

  const [job, setJob] =
    useState<Job | null>(null);

  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 0,
  });

  const [filter, setFilter] =
    useState<FilterId>("all");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [selectedAd, setSelectedAd] =
    useState<Ad | null>(null);

  const [tracked, setTracked] =
    useState(false);

  const [trackingLoading, setTrackingLoading] =
    useState(false);

  const [trackedLastCollectedAt, setTrackedLastCollectedAt] =
    useState<string | null>(null);

  const [lastUpdatedAt, setLastUpdatedAt] =
    useState<string | null>(null);

  const searchRef =
    useRef<HTMLInputElement>(null);

  const searchWrapRef =
    useRef<HTMLDivElement>(null);

  const requestIdRef =
    useRef(0);

  const searchAbortRef =
    useRef<AbortController | null>(null);

    const previousPersistedAdsRef =
  useRef(0);
  const mountedRef =
    useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    const normalized = country
      .trim()
      .toUpperCase();
    if (normalized) {
      setCountryInput(normalized);
    }
  }, [country]);

  useEffect(() => {
    const handlePointerDown = (
      event: MouseEvent,
    ) => {
      if (
        !searchWrapRef.current?.contains(
          event.target as Node,
        )
      ) {
        setSuggestionOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );
    };
  }, []);

  const visibleSuggestionCatalog = useMemo(() => {
    const queryText = input.trim().toLocaleLowerCase();

    if (queryText.length < 2) {
      return [];
    }

    const ranked = initialSuggestionCatalog
      .filter((suggestion) => {
        if (mode === "advertiser") {
          return suggestion.type === "advertiser";
        }
        return true;
      })
      .filter((suggestion) =>
        suggestion.label
          .toLocaleLowerCase()
          .includes(queryText),
      )
      .map((suggestion) => {
        const label = suggestion.label
          .trim()
          .toLocaleLowerCase();
        let score = 0;

        if (label === queryText) score += 1000;
        if (label.startsWith(queryText)) score += 500;

        const wordMatch = label
          .split(/\s+/)
          .some((word) => word.startsWith(queryText));
        if (wordMatch) score += 250;

        score += 100;

        return { suggestion, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.suggestion.label.localeCompare(
          b.suggestion.label,
          undefined,
          { sensitivity: "base" },
        );
      })
      .slice(0, 8)
      .map(({ suggestion }) => suggestion);

    return ranked;
  }, [input, initialSuggestionCatalog, mode]);

  useEffect(() => {
    setSuggestions(visibleSuggestionCatalog);
    setSuggestionLoading(false);

    if (input.trim().length < 2) {
      setSuggestionOpen(false);
      return;
    }

    setSuggestionOpen(true);
  }, [input, visibleSuggestionCatalog]);

  const refreshCollection = useCallback(
    async ({
      searchQuery,
      searchCountry,
      searchPlatform,
      searchMode,
    }: {
      searchQuery: string;
      searchCountry: string;
      searchPlatform: Platform;
      searchMode: SearchMode;
    }) => {
      try {
        const url = new URL(
          "/api/ad-intelligence/refresh",
          window.location.origin,
        );

        url.searchParams.set(
          "q",
          searchQuery,
        );

        url.searchParams.set(
          "country",
          searchCountry
            .trim()
            .toUpperCase(),
        );

        url.searchParams.set(
          "platform",
          searchPlatform,
        );

        url.searchParams.set(
          "mode",
          searchMode,
        );

        const response = await fetch(
          url,
          {
            method: "POST",
            cache: "no-store",
          },
        );

        const data =
          (await response.json()) as {
            success?: boolean;
            job?: Job | null;
          };

        if (
          !response.ok ||
          !data.success ||
          !data.job
        ) {
          return;
        }

        if (mountedRef.current) {
          setJob(data.job);
        }
      } catch {
        // Search results remain usable if background refresh cannot start.
      }
    },
    [],
  );

  const loadTrackedStatus = useCallback(
    async ({
      searchQuery,
      searchCountry,
      searchPlatform,
    }: {
      searchQuery: string;
      searchCountry: string;
      searchPlatform: Platform;
    }) => {
      try {
        const url = new URL(
          "/api/ad-intelligence/track",
          window.location.origin,
        );

        url.searchParams.set(
          "query",
          searchQuery,
        );

        url.searchParams.set(
          "country",
          searchCountry
            .trim()
            .toUpperCase(),
        );

        url.searchParams.set(
          "platform",
          searchPlatform,
        );

        const response = await fetch(
          url,
          {
            cache: "no-store",
          },
        );

        const data =
          (await response.json()) as TrackResponse;

        if (!response.ok) {
          return;
        }

        if (!mountedRef.current) {
          return;
        }

        setTracked(
          data.tracked === true,
        );

        setTrackedLastCollectedAt(
          data.lastCollectedAt ?? null,
        );
      } catch {
        // Tracking state is non-blocking.
      }
    },
    [],
  );
const refreshIndexedResults = useCallback(
  async ({
    searchQuery,
    searchCountry,
    searchPlatform,
    searchMode,
    requestId,
  }: {
    searchQuery: string;
    searchCountry: string;
    searchPlatform: Platform;
    searchMode: SearchMode;
    requestId: number;
  }) => {
    try {
      const url = new URL(
        "/api/ad-intelligence/search",
        window.location.origin,
      );

      url.searchParams.set(
        "q",
        searchQuery,
      );

      url.searchParams.set(
        "country",
        searchCountry,
      );

      url.searchParams.set(
        "platform",
        searchPlatform,
      );

      url.searchParams.set(
        "mode",
        searchMode,
      );

      url.searchParams.set(
        "page",
        "1",
      );

      url.searchParams.set(
        "limit",
        "24",
      );

      const response =
        await fetch(
          url,
          {
            cache: "no-store",
          },
        );

      const data =
        (await response.json()) as SearchResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        return;
      }

      if (
        !mountedRef.current ||
        requestId !==
          requestIdRef.current
      ) {
        return;
      }

      setAds(
        Array.isArray(data.ads)
          ? data.ads
          : [],
      );

      setSummary(
        data.summary ??
          EMPTY_SUMMARY,
      );

      setIntelligence(
        data.intelligence ??
          null,
      );

      setLastUpdatedAt(
        data.lastUpdatedAt ??
          null,
      );

      setPagination({
        page:
          data.page ?? 1,
        total:
          data.total ?? 0,
        totalPages:
          data.totalPages ??
          0,
      });

      onResultCountChange?.(
        data.total ?? 0,
      );
    } catch {
      /*
       * Progressive refresh is deliberately best effort.
       * Existing visible results must never disappear because
       * one background poll failed.
       */
    }
  },
  [onResultCountChange],
);
  const search = useCallback(
    async (
      page = 1,
      forcedQuery?: string,
      options?: {
        skipBackgroundRefresh?: boolean;
        forcedMode?: SearchMode;
      },
    ) => {
      const q = (
        forcedQuery ?? input
      ).trim();

      const searchModeUsed = options?.forcedMode ?? mode;

      const normalizedCountry =
        countryInput
          .trim()
          .toUpperCase();

      if (q.length < 2) {
        setError(
          "Enter at least 2 characters to search.",
        );
        searchRef.current?.focus();
        return;
      }

      if (
        normalizedCountry.length !== 2 ||
        !/^[A-Z]{2}$/.test(
          normalizedCountry,
        )
      ) {
        setError(
          "Enter a valid 2-letter country code, for example IN.",
        );
        return;
      }

      const requestId =
        ++requestIdRef.current;

      searchAbortRef.current?.abort();

      const controller =
        new AbortController();

      searchAbortRef.current =
        controller;

      setLoading(true);
      setError("");
      setSuggestionOpen(false);

      if (page === 1) {
        setFilter("all");
      }

      try {
        const url = new URL(
          "/api/ad-intelligence/search",
          window.location.origin,
        );

        url.searchParams.set(
          "q",
          q,
        );

        url.searchParams.set(
          "country",
          normalizedCountry,
        );

        url.searchParams.set(
          "platform",
          platform,
        );

        url.searchParams.set(
          "mode",
          searchModeUsed,
        );

        url.searchParams.set(
          "page",
          String(page),
        );

        url.searchParams.set(
          "limit",
          "24",
        );

        const response = await fetch(
          url,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data =
          (await response.json()) as SearchResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Search failed.",
          );
        }

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        const nextAds =
          Array.isArray(data.ads)
            ? data.ads
            : [];

        setAds(nextAds);

        setSummary(
          data.summary ??
            EMPTY_SUMMARY,
        );

        setIntelligence(
          data.intelligence ??
            null,
        );

        setLastUpdatedAt(
          data.lastUpdatedAt ??
            null,
        );

        setPagination({
          page:
            data.page ?? page,
          total:
            data.total ?? 0,
          totalPages:
            data.totalPages ?? 0,
        });

        setJob(null);

        setSelectedAd(null);

        setTracked(false);
        setTrackedLastCollectedAt(
          null,
        );

        onQueryChange?.(q);
        onResultCountChange?.(
          data.total ?? 0,
        );

        void loadTrackedStatus({
          searchQuery: q,
          searchCountry:
            normalizedCountry,
          searchPlatform: platform,
        });

        if (
          !options?.skipBackgroundRefresh
        ) {
          void refreshCollection({
            searchQuery: q,
            searchCountry:
              normalizedCountry,
            searchPlatform:
              platform,
            searchMode: mode,
          });
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name ===
            "AbortError"
        ) {
          return;
        }

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Search failed. Please try again.",
        );
      } finally {
        if (
          requestId ===
          requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [
      countryInput,
      input,
      loadTrackedStatus,
      mode,
      onQueryChange,
      onResultCountChange,
      platform,
      refreshCollection,
    ],
  );

useEffect(() => {
  const status = job?.status;

  if (
    !job?.id ||
    !isActiveJobStatus(status)
  ) {
    return;
  }

  const searchQuery =
    input.trim();

  const searchCountry =
    countryInput
      .trim()
      .toUpperCase();

  const searchPlatform =
    platform;

  const searchMode =
    mode;

  if (
    searchQuery.length <
      2 ||
    !/^[A-Z]{2}$/.test(
      searchCountry,
    )
  ) {
    return;
  }

  let cancelled = false;

  let polling = false;

  const poll = async () => {
    if (
      cancelled ||
      polling
    ) {
      return;
    }

    polling = true;

    try {
      const response =
        await fetch(
          `/api/ad-intelligence/search/status/${job.id}`,
          {
            cache: "no-store",
          },
        );

      const data =
        (await response.json()) as {
          success?: boolean;
          job?: Job;
        };

      if (
        cancelled ||
        !response.ok ||
        !data.success ||
        !data.job
      ) {
        return;
      }

      const nextJob =
        data.job;

      if (
        cancelled ||
        !mountedRef.current
      ) {
        return;
      }

      setJob(
        nextJob,
      );

      const persistedAds =
        nextJob.persistedAds ??
        0;

      const previousPersistedAds =
        previousPersistedAdsRef.current;

      const persistedAdsChanged =
        persistedAds !==
        previousPersistedAds;

      previousPersistedAdsRef.current =
        persistedAds;

      /*
       * The important part:
       *
       * Whenever the collector has persisted new creatives,
       * fetch the currently indexed search results immediately.
       *
       * We do NOT wait for "complete".
       */
      if (
        persistedAdsChanged
      ) {
        await refreshIndexedResults({
          searchQuery,
          searchCountry,
          searchPlatform,
          searchMode,
          requestId:
            requestIdRef.current,
        });
      }

      /*
       * Final refresh guarantees that the final global
       * statistics are visible after collection completes.
       */
      if (
        nextJob.status ===
          "complete" ||
        nextJob.status ===
          "failed"
      ) {
        await refreshIndexedResults({
          searchQuery,
          searchCountry,
          searchPlatform,
          searchMode,
          requestId:
            requestIdRef.current,
        });

        return;
      }
    } catch {
      /*
       * Polling is best effort.
       * Never remove already-visible results.
       */
    } finally {
      polling = false;
    }
  };

  void poll();

  const timer =
    window.setInterval(
      () => {
        void poll();
      },
      1800,
    );

  return () => {
    cancelled = true;
    window.clearInterval(
      timer,
    );
  };
}, [
  countryInput,
  input,
  job?.id,
  job?.persistedAds,
  job?.status,
  mode,
  platform,
  refreshIndexedResults,
]);

  const filteredAds = useMemo(() => {
    const list = [...ads];

    switch (filter) {
      case "active":
        return list.filter(
          (ad) =>
            ad.isActive !== false,
        );

      case "video":
        return list.filter(
          (ad) =>
            ad.creativeType ===
            "video",
        );

      case "image":
        return list.filter(
          (ad) =>
            ad.creativeType ===
            "image",
        );

      case "carousel":
        return list.filter(
          (ad) =>
            ad.creativeType ===
            "carousel",
        );

      case "creator":
        return list.filter(
          (ad) =>
            Boolean(ad.creatorName),
        );

      case "longest":
        return list.sort(
          (a, b) =>
            (b.runningDays ?? 0) -
            (a.runningDays ?? 0),
        );

      default:
        return list;
    }
  }, [ads, filter]);

  const topHook =
    intelligence?.topHooks?.[0];

  const topOffer =
    intelligence?.topOffers?.[0];

  const topCreator =
    intelligence?.topCreators?.[0];

  const applySuggestion = (
    suggestion: Suggestion,
  ) => {
    setInput(
      suggestion.label,
    );

    onQueryChange?.(
      suggestion.label,
    );

    setSuggestionOpen(false);

    void search(
      1,
      suggestion.label,
    );
  };

  const clearSearch = () => {
    searchAbortRef.current?.abort();
    
    setInput("");
    onQueryChange?.("");

    setSuggestions([]);
    setSuggestionOpen(false);

    setAds([]);
    setSummary(
      EMPTY_SUMMARY,
    );
    setIntelligence(null);
    setJob(null);

    setPagination({
      page: 1,
      total: 0,
      totalPages: 0,
    });

    setTracked(false);
    setTrackedLastCollectedAt(
      null,
    );

    setLastUpdatedAt(null);
    setSelectedAd(null);
    setError("");
  };

  const changePlatform = (
    nextPlatform: Platform,
  ) => {
    onPlatformChange?.(
      nextPlatform,
    );

    setSuggestions([]);
    setSuggestionOpen(false);
    setTracked(false);
    setTrackedLastCollectedAt(
      null,
    );
    setJob(null);
    setSelectedAd(null);
  };

  const changeMode = (
    nextMode: SearchMode,
  ) => {
    if (nextMode === mode) {
      return;
    }

    setMode(nextMode);
    setSuggestions([]);
    setSuggestionOpen(false);
    setTracked(false);
    setTrackedLastCollectedAt(
      null,
    );
    setJob(null);
    setSelectedAd(null);
  };

  const trackCurrent =
    async () => {
      const q = input.trim();

      if (
        !q ||
        q.length < 2 ||
        mode !== "advertiser"
      ) {
        return;
      }

      const normalizedCountry =
        countryInput
          .trim()
          .toUpperCase();

      if (
        normalizedCountry.length !== 2 ||
        !/^[A-Z]{2}$/.test(
          normalizedCountry,
        )
      ) {
        setError(
          "Enter a valid 2-letter country code before tracking.",
        );
        return;
      }

      setTrackingLoading(true);
      setError("");

      try {
        if (tracked) {
          const url = new URL(
            "/api/ad-intelligence/track",
            window.location.origin,
          );

          url.searchParams.set(
            "query",
            q,
          );

          url.searchParams.set(
            "country",
            normalizedCountry,
          );

          url.searchParams.set(
            "platform",
            platform,
          );

          const response =
            await fetch(
              url,
              {
                method: "DELETE",
                cache: "no-store",
              },
            );

          const data =
            (await response.json()) as TrackResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Failed to stop tracking.",
            );
          }

          setTracked(false);
          setTrackedLastCollectedAt(
            null,
          );
          return;
        }

        const response =
          await fetch(
            "/api/ad-intelligence/track",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                query: q,
                country:
                  normalizedCountry,
                platform,
              }),
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as TrackResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Failed to track competitor.",
          );
        }

        setTracked(true);

        if (
          data.job
        ) {
          setJob(data.job);
        } else if (
          data.jobId
        ) {
          const statusResponse =
            await fetch(
              `/api/ad-intelligence/search/status/${data.jobId}`,
              {
                cache: "no-store",
              },
            );

          if (
            statusResponse.ok
          ) {
            const statusData =
              (await statusResponse.json()) as {
                success?: boolean;
                job?: Job;
              };

            if (
              statusData.success &&
              statusData.job
            ) {
              setJob(
                statusData.job,
              );
            }
          }
        }

        void loadTrackedStatus({
          searchQuery: q,
          searchCountry:
            normalizedCountry,
          searchPlatform: platform,
        });
      } catch (trackError) {
        setError(
          trackError instanceof Error
            ? trackError.message
            : "Failed to update tracking.",
        );
      } finally {
        setTrackingLoading(false);
      }
    };

  const activeJob =
    isActiveJobStatus(
      job?.status,
    );

  return (
    <>
      <section className="zt-adspy">
        <div className="zt-adspy-hero">
          <div>
            <span className="zt-eyebrow">
              AD INTELLIGENCE
            </span>

            <h2>
              Research competitors without losing the signal.
            </h2>

            <p>
              Search the indexed public market,
              see what is running, and let
              Zooptrack update the dataset in
              the background.
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
              <label>
                Platform
              </label>

              <select
                value={platform}
                onChange={(event) =>
                  changePlatform(
                    event.target.value as Platform,
                  )
                }
              >
                <option value="meta">
                  Meta
                </option>

                <option value="google">
                  Google / YouTube
                </option>

                <option value="linkedin">
                  LinkedIn
                </option>
              </select>
            </div>

            <div
              ref={searchWrapRef}
              className="zt-search-wrap"
            >
              <label>
                Brand or keyword
              </label>

              <div className="zt-search-field">
                <Search size={18} />

                <input
                  ref={searchRef}
                  value={input}
                  onChange={(event) => {
                    const next =
                      event.target.value;

                    setInput(next);

                    onQueryChange?.(next);

                    setSuggestionOpen(
                      next.trim().length >= 2,
                    );
                  }}
                  onFocus={() => {
                    if (
                      suggestions.length >
                      0
                    ) {
                      setSuggestionOpen(
                        true,
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();
                      void search();
                    }

                    if (
                      event.key ===
                      "Escape"
                    ) {
                      setSuggestionOpen(
                        false,
                      );
                    }
                  }}
                  placeholder="Search a brand, advertiser or keyword"
                  aria-label="Search a brand, advertiser or keyword"
                  aria-expanded={
                    suggestionOpen
                  }
                  aria-autocomplete="list"
                />

                {input ? (
                  <button
                    type="button"
                    className="zt-clear"
                    onClick={
                      clearSearch
                    }
                    aria-label="Clear search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              {suggestionOpen &&
              input.trim().length >= 2 ? (
                <div
                  className="zt-suggestions"
                  role="listbox"
                  aria-label="Search suggestions"
                >
                  <div className="zt-suggestion-head">
                    <span>
                      Suggestions
                    </span>

                    {suggestionLoading ? (
                      <Loader2
                        size={14}
                        className="zt-spin"
                      />
                    ) : null}
                  </div>

                  {suggestions.length ? (
                    suggestions.map(
                      (
                        suggestion,
                      ) => (
                        <button
                          key={`${suggestion.type}:${suggestion.id}`}
                          type="button"
                          className="zt-suggestion"
                          role="option"
                          onMouseDown={(
                            event,
                          ) =>
                            event.preventDefault()
                          }
                          onClick={() =>
                            applySuggestion(
                              suggestion,
                            )
                          }
                        >
                          <span className="zt-suggestion-icon">
                            {suggestion.type ===
                            "advertiser" ? (
                              <UserRound
                                size={15}
                              />
                            ) : suggestion.type ===
                              "creator" ? (
                              <Sparkles
                                size={15}
                              />
                            ) : (
                              <Tag
                                size={15}
                              />
                            )}
                          </span>

                          <span>
                            <strong>
                              {
                                suggestion.label
                              }
                            </strong>

                            <small>
                              {suggestion.type ===
                              "advertiser"
                                ? "Advertiser"
                                : suggestion.type ===
                                  "creator"
                                ? "Creator"
                                : "Creative keyword"}
                            </small>
                          </span>

                          <ArrowUpRight
                            size={14}
                          />
                        </button>
                      ),
                    )
                  ) : suggestionLoading ? (
                    <div className="zt-suggestion-empty">
                      Finding matching indexed suggestions…
                    </div>
                  ) : (
                    <div className="zt-suggestion-empty">
                      No matching indexed suggestions.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="zt-country-wrap">
              <label>
                Country
              </label>

              <input
                value={countryInput}
                maxLength={2}
                onChange={(event) => {
                  const nextCountry = event.target.value
                    .replace(/[^a-z]/gi, "")
                    .slice(0, 2)
                    .toUpperCase();

                  setCountryInput(nextCountry);
                  onCountryChange?.(nextCountry);
                }}
                aria-label="Country code"
                placeholder="IN"
              />
            </div>

            <button
              type="button"
              className="zt-search-btn"
              onClick={() =>
                void search()
              }
              disabled={loading}
            >
              {loading ? (
                <Loader2
                  size={16}
                  className="zt-spin"
                />
              ) : (
                <Search size={16} />
              )}

              {loading
                ? "Searching"
                : "Search"}
            </button>

            <button
              type="button"
              className={
                tracked
                  ? "zt-track-btn zt-track-done"
                  : "zt-track-btn"
              }
              onClick={() =>
                void trackCurrent()
              }
              disabled={
                trackingLoading ||
                mode !== "advertiser" ||
                input.trim().length < 2
              }
              title={
                mode ===
                "advertiser"
                  ? tracked
                    ? "Stop tracking this competitor"
                    : "Track this competitor"
                  : "Switch to Advertiser mode to track a competitor"
              }
            >
              {trackingLoading ? (
                <Loader2
                  size={16}
                  className="zt-spin"
                />
              ) : tracked ? (
                <Check size={16} />
              ) : (
                <Bookmark size={16} />
              )}

              {trackingLoading
                ? "Updating"
                : tracked
                ? "Tracked"
                : "Track"}
            </button>
          </div>

          <div className="zt-mode-row">
            <span>
              Search mode
            </span>

            <button
              type="button"
              className={
                mode === "advertiser"
                  ? "zt-mode active"
                  : "zt-mode"
              }
              onClick={() =>
                changeMode(
                  "advertiser",
                )
              }
            >
              Advertiser
            </button>

            <button
              type="button"
              className={
                mode === "keyword"
                  ? "zt-mode active"
                  : "zt-mode"
              }
              onClick={() =>
                changeMode(
                  "keyword",
                )
              }
            >
              Keyword
            </button>

            <span className="zt-mode-help">
              {mode ===
              "advertiser"
                ? "Search a competitor, then optionally track it."
                : "Search creative copy, products and metadata."}
            </span>

            {tracked &&
            trackedLastCollectedAt ? (
              <span className="zt-mode-help">
                Last tracked refresh:{" "}
                {dateLabel(
                  trackedLastCollectedAt,
                )}
              </span>
            ) : null}
          </div>

          {activeJob ? (
            <div className="zt-job-strip">
              <div className="zt-job-main">
                <RefreshCw
                  size={15}
                  className="zt-spin-soft"
                />

                <strong>
                  Updating {input.trim()}
                </strong>

                <span>
                  Existing results remain available while
                  Zooptrack refreshes the source data.
                </span>
              </div>

              <div
                className="zt-job-progress"
                aria-label="Background refresh progress"
              >
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        8,
                        job?.discoveredAds
                          ? (job.persistedAds /
                              job.discoveredAds) *
                            100
                          : 8,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <div
              className="zt-error"
              role="alert"
            >
              {error}
            </div>
          ) : null}
        </div>

<div className="zt-stats-grid">
  <Stat
    icon={<Activity size={16} />}
    label="Indexed"
    value={summary.totalAds}
    hint="Entire filtered dataset"
  />

  <Stat
    icon={<Activity size={16} />}
    label="Active"
    value={summary.activeAds}
    hint="Active creatives"
  />

  <Stat
    icon={<Activity size={16} />}
    label="Inactive"
    value={summary.inactiveAds}
    hint="Inactive creatives"
  />

  <Stat
    icon={<Video size={16} />}
    label="Video"
    value={summary.videoAds}
    hint="Video creatives"
  />

  <Stat
    icon={<ImageIcon size={16} />}
    label="Image"
    value={summary.imageAds}
    hint="Image creatives"
  />

  <Stat
    icon={<Layers3 size={16} />}
    label="Carousel"
    value={summary.carouselAds}
    hint="Carousel creatives"
  />

  <Stat
    icon={<UserRound size={16} />}
    label="Creators"
    value={summary.creatorAds}
    hint="Creator-associated creatives"
  />

  <Stat
    icon={<Clock3 size={16} />}
    label="Avg. running"
    value={`${summary.averageRunningDays}d`}
    hint="Average observed duration"
  />

  <Stat
    icon={<Clock3 size={16} />}
    label="Longest"
    value={`${summary.longestRunningDays}d`}
    hint="Longest observed duration"
  />
</div>
        <div className="zt-insight-cards">
  <div className="zt-insight-card">
    <span>Top creator</span>
    <strong>
      {topCreator?.label ||
        "No creator signal"}
    </strong>
    <small>
      {topCreator
        ? `${topCreator.count} observed creatives`
        : "Not enough signal yet"}
    </small>
  </div>

  <div className="zt-insight-card">
    <span>Top offer</span>
    <strong>
      {topOffer?.label ||
        "No offer detected"}
    </strong>
    <small>
      {topOffer
        ? `${topOffer.count} observed creatives`
        : "Not enough signal yet"}
    </small>
  </div>

  <div className="zt-insight-card">
    <span>Top hook</span>
    <strong>
      {topHook?.label ||
        "No hook detected"}
    </strong>
    <small>
      {topHook
        ? `${topHook.count} observed creatives`
        : "Not enough signal yet"}
    </small>
  </div>

  <div className="zt-insight-card">
    <span>Creator share</span>
    <strong>
      {summary.totalAds > 0
        ? `${Math.round(
            (summary.creatorAds /
              summary.totalAds) *
              100,
          )}%`
        : "—"}
    </strong>
    <small>
      Of indexed creatives
    </small>
  </div>

  <div className="zt-insight-card">
    <span>Video share</span>
    <strong>
      {summary.totalAds > 0
        ? `${Math.round(
            (summary.videoAds /
              summary.totalAds) *
              100,
          )}%`
        : "—"}
    </strong>
    <small>
      Of indexed creatives
    </small>
  </div>
</div>

        <section className="zt-library">
          <div className="zt-library-head">
            <div>
              <span className="zt-overline">
                CREATIVE LIBRARY
              </span>

              <h3>
                Research the ads, not the scorecards.
              </h3>
            </div>

            <span className="zt-result-count">
              {pagination.total} indexed
              {lastUpdatedAt
                ? ` · Updated ${dateLabel(
                    lastUpdatedAt,
                  )}`
                : ""}
            </span>
          </div>

          <div className="zt-filter-row">
            {FILTERS.map(
              ([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={
                    filter === id
                      ? "zt-filter active"
                      : "zt-filter"
                  }
                  onClick={() =>
                    setFilter(id)
                  }
                >
                  {label}
                </button>
              ),
            )}
          </div>

          {loading &&
          !ads.length ? (
            <div className="zt-library-loading">
              <Loader2
                size={30}
                className="zt-spin"
              />

              <strong>
                Searching indexed creatives
              </strong>

              <span>
                Results are loaded from Zooptrack's
                indexed market; source refresh happens
                separately in the background.
              </span>
            </div>
          ) : filteredAds.length ? (
            <div className="zt-ad-grid">
              {filteredAds.map(
                (ad) => (
                  <CreativeCard
                    key={`${ad.platform}:${ad.id}`}
                    ad={ad}
                    onOpen={() =>
                      setSelectedAd(
                        ad,
                      )
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <div className="zt-library-empty">
              <div className="zt-empty-icon">
                <Search size={20} />
              </div>

              <strong>
                {activeJob
                  ? "No indexed results yet"
                  : "No indexed creatives match this view."}
              </strong>

              <span>
                {activeJob
                  ? "Zooptrack is collecting the public source in the background. Existing results are not blocked."
                  : "Try another mode, search term or filter."}
              </span>
            </div>
          )}

          {pagination.totalPages >
          1 ? (
            <div className="zt-pagination">
              <button
                type="button"
                disabled={
                  pagination.page <=
                  1
                }
                onClick={() =>
                  void search(
                    pagination.page -
                      1,
                    undefined,
                    {
                      skipBackgroundRefresh:
                        true,
                    },
                  )
                }
              >
                <ChevronLeft
                  size={16}
                />
                Previous
              </button>

              <span>
                Page{" "}
                {pagination.page}{" "}
                of{" "}
                {
                  pagination.totalPages
                }
              </span>

              <button
                type="button"
                disabled={
                  pagination.page >=
                  pagination.totalPages
                }
                onClick={() =>
                  void search(
                    pagination.page +
                      1,
                    undefined,
                    {
                      skipBackgroundRefresh:
                        true,
                    },
                  )
                }
              >
                Next
                <ChevronRight
                  size={16}
                />
              </button>
            </div>
          ) : null}
        </section>
      </section>

      {selectedAd ? (
        <div
          className="zt-drawer-backdrop"
          role="presentation"
          onMouseDown={() =>
            setSelectedAd(null)
          }
        >
          <aside
            className="zt-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Creative intelligence"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="zt-drawer-head">
              <div>
                <span className="zt-overline">
                  CREATIVE INTELLIGENCE
                </span>

                <h3>
                  {selectedAd.headline ||
                    selectedAd.productName ||
                    "Creative"}
                </h3>
              </div>

              <button
                type="button"
                className="zt-icon-btn"
                onClick={() =>
                  setSelectedAd(
                    null,
                  )
                }
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            {selectedAd.videoUrl ? (
              <div className="zt-drawer-media">
                <video
                  src={
                    safeUrl(
                      selectedAd.videoUrl,
                    ) ?? undefined
                  }
                  poster={
                    safeUrl(
                      selectedAd.thumbnailUrl ||
                        selectedAd.imageUrl,
                    ) ?? undefined
                  }
                  controls
                  playsInline
                  preload="metadata"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    background: "#000",
                  }}
                />
              </div>
            ) : mediaUrl(selectedAd) ? (
              <div className="zt-drawer-media">
                <img
                  src={
                    mediaUrl(
                      selectedAd,
                    ) as string
                  }
                  alt={
                    selectedAd.headline ||
                    "Creative"
                  }
                />
              </div>
            ) : null}

            <div className="zt-drawer-content">
              <div className="zt-drawer-brand">
                {selectedAd.advertiserName ||
                  "Unknown advertiser"}
              </div>

              <p className="zt-drawer-copy">
                {selectedAd.primaryText ||
                  selectedAd.description ||
                  "No primary copy captured."}
              </p>

              <div className="zt-detail-grid">
                <div>
                  <span>
                    Hook
                  </span>

                  <strong>
                    {hook(
                      selectedAd,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Format
                  </span>

                  <strong>
                    {selectedAd.creativeType ||
                      "Unknown"}
                  </strong>
                </div>

                <div>
                  <span>
                    Running
                  </span>

                  <strong>
                    {selectedAd.runningDays ??
                      0}{" "}
                    days
                  </strong>
                </div>

                <div>
                  <span>
                    CTA
                  </span>

                  <strong>
                    {selectedAd.callToAction ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <span>
                    First seen
                  </span>

                  <strong>
                    {dateLabel(
                      selectedAd.firstSeen,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Last seen
                  </span>

                  <strong>
                    {dateLabel(
                      selectedAd.lastSeen,
                    )}
                  </strong>
                </div>
              </div>

              <div className="zt-drawer-actions">
                {safeUrl(
                  selectedAd.sourceUrl,
                ) ? (
                  <a
                    href={
                      safeUrl(
                        selectedAd.sourceUrl,
                      ) as string
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="zt-btn zt-btn-dark"
                  >
                    Open Ad Library
                    <ArrowUpRight
                      size={14}
                    />
                  </a>
                ) : null}

                {safeUrl(
                  selectedAd.landingPage,
                ) ? (
                  <a
                    href={
                      safeUrl(
                        selectedAd.landingPage,
                      ) as string
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="zt-btn zt-btn-light"
                  >
                    Landing page
                    <ArrowUpRight
                      size={14}
                    />
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