import type {
  AdSearchSummary,
  EnrichedCompetitorAd,
} from "./intelligence";

import type {
  CreativeFamily,
  CreativeFamilySummary,
} from "./intelligence/creative-families";

import type {
  CreatorAdAnalysis,
  CreatorAnalysisSummary,
} from "./intelligence/creator-analysis";

import type {
  VideoAnalysis,
  VideoAnalysisSummary,
} from "./intelligence/video-analysis";

import type {
  MarketingAnalysis,
  MarketingAnalysisSummary,
} from "./intelligence/marketing-analysis";

/* =========================================================
 * PLATFORM / MODE
 * ======================================================= */

export type AdSpyPlatform =
  | "meta"
  | "google"
  | "linkedin";

export type AdSpySearchMode =
  | "advertiser"
  | "keyword";

/* =========================================================
 * PAGINATION
 * ======================================================= */

export type AdSpyPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;

  hasNextPage: boolean;
  hasPreviousPage: boolean;

  nextPage: number | null;
  previousPage: number | null;
};

/* =========================================================
 * SEARCH INPUT
 * ======================================================= */

export type AdSpySearchContext = {
  query: string;
  country: string;
  platform: AdSpyPlatform;
  mode: AdSpySearchMode;
};

/* =========================================================
 * TOP OFFERS
 * ======================================================= */

export type AdSpyTopOffer = {
  offer: string;
  count: number;
};

/* =========================================================
 * HOOK PATTERNS
 * ======================================================= */

export type AdSpyHookPattern = {
  label: string;
  count: number;
  share: number;
};

/* =========================================================
 * RECOMMENDED EXPERIMENT
 * ======================================================= */

export type AdSpyRecommendedExperiment = string;

/* =========================================================
 * CREATOR INTELLIGENCE
 * ======================================================= */

export type AdSpyCreatorIntelligence = {
  analyses: CreatorAdAnalysis[];
  summary: CreatorAnalysisSummary;
};

/* =========================================================
 * VIDEO INTELLIGENCE
 * ======================================================= */

export type AdSpyVideoIntelligence = {
  analyses: VideoAnalysis[];
  summary: VideoAnalysisSummary;
};

/* =========================================================
 * MARKETING INTELLIGENCE
 * ======================================================= */

export type AdSpyMarketingIntelligence = {
  analyses: MarketingAnalysis[];
  summary: MarketingAnalysisSummary;
};

/* =========================================================
 * CREATIVE FAMILY INTELLIGENCE
 * ======================================================= */

export type AdSpyCreativeFamilyIntelligence = {
  families: CreativeFamily[];
  summary: CreativeFamilySummary;
};

/* =========================================================
 * INTELLIGENCE RESULT
 * ======================================================= */

export type AdSpyIntelligence = {
  summary: AdSearchSummary;

  creativeFamilies:
    AdSpyCreativeFamilyIntelligence;

  creators:
    AdSpyCreatorIntelligence;

  video:
    AdSpyVideoIntelligence;

  marketing:
    AdSpyMarketingIntelligence;

  topOffers: AdSpyTopOffer[];

  hookPatterns: AdSpyHookPattern[];

  recommendedExperiments:
    AdSpyRecommendedExperiment[];
};

/* =========================================================
 * RESULT METADATA
 *
 * These fields are deliberately kept separate from the
 * intelligence payload so the UI can understand whether
 * the result came from storage/cache or a fresh scrape.
 * ======================================================= */

export type AdSpyResultMeta = {
  fetchedAt: string;

  cacheHit: boolean;

  stale: boolean;

  source:
    | "fresh"
    | "cache"
    | "stale-cache";

  scrapeDurationMs: number;

  analysisDurationMs: number;

  totalDurationMs: number;
};

/* =========================================================
 * COMPLETE SEARCH RESULT
 * ======================================================= */

export type AdSpySearchResult = {
  search: AdSpySearchContext;

  ads: EnrichedCompetitorAd[];

  pagination: AdSpyPagination;

  intelligence: AdSpyIntelligence;

  meta: AdSpyResultMeta;
};

/* =========================================================
 * API RESPONSE
 * ======================================================= */

export type AdSpySearchApiResponse =
  | {
      success: true;

      result: AdSpySearchResult;

      /*
       * Convenience aliases retained for compatibility with
       * the current AdSpy frontend while the frontend is being
       * migrated to result.*.
       */
      ads: EnrichedCompetitorAd[];

      count: number;

      pagination: AdSpyPagination;
    }
  | {
      success: false;

      error: string;

      message?: string;
    };

/* =========================================================
 * CACHE RESULT
 * ======================================================= */

export type AdSpyCachedResult = {
  result: AdSpySearchResult;

  createdAt: string;

  expiresAt: string;
};

/* =========================================================
 * SEARCH JOB STATUS
 * ======================================================= */

export type AdSpySearchStage =
  | "queued"
  | "scraping"
  | "normalizing"
  | "enriching"
  | "analyzing"
  | "clustering"
  | "finalizing"
  | "complete"
  | "failed";

/* =========================================================
 * SEARCH JOB
 * ======================================================= */

export type AdSpySearchJob = {
  id: string;

  search: AdSpySearchContext;

  stage: AdSpySearchStage;

  discoveredAds: number;

  normalizedAds: number;

  analyzedAds: number;

  familyCount: number;

  startedAt: string;

  updatedAt: string;

  completedAt: string | null;

  error: string | null;
};

/* =========================================================
 * HELPERS
 * ======================================================= */

/**
 * Build the canonical cache key for an AdSpy search.
 *
 * IMPORTANT:
 * This function intentionally lives here so every cache layer,
 * whether Supabase, Redis, or an in-memory cache, uses exactly
 * the same identity rules.
 */
export function buildAdSpySearchKey(
  input: AdSpySearchContext
): string {
  const query =
    input.query
      .trim()
      .toLowerCase();

  const country =
    input.country
      .trim()
      .toUpperCase();

  return [
    "adspy",
    input.platform,
    country,
    input.mode,
    query,
  ].join(":");
}

/**
 * Normalize the search context so it can safely be persisted,
 * cached, compared, and logged.
 */
export function normalizeAdSpySearchContext(
  input: AdSpySearchContext
): AdSpySearchContext {
  return {
    query: input.query.trim(),

    country:
      input.country
        .trim()
        .toUpperCase(),

    platform: input.platform,

    mode: input.mode,
  };
}

/**
 * Calculate the age of a result in milliseconds.
 */
export function getAdSpyResultAgeMs(
  result:
    | AdSpySearchResult
    | AdSpyCachedResult
): number {
  const createdAt =
    "createdAt" in result
      ? result.createdAt
      : result.meta.fetchedAt;

  const timestamp =
    new Date(
      createdAt
    ).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    Date.now() -
      timestamp
  );
}

/**
 * Determine whether a result is still fresh.
 *
 * Default: 5 minutes.
 */
export function isAdSpyResultFresh(
  result:
    | AdSpySearchResult
    | AdSpyCachedResult,
  maxAgeMs =
    5 * 60 * 1000
): boolean {
  const age =
    getAdSpyResultAgeMs(
      result
    );

  return age <= maxAgeMs;
}

/**
 * Determine whether a result is stale but still usable.
 *
 * Example default policy:
 *
 * fresh: <= 5 minutes
 * stale: > 5 minutes and <= 30 minutes
 * expired: > 30 minutes
 */
export function isAdSpyResultStale(
  result:
    | AdSpySearchResult
    | AdSpyCachedResult,
  freshMaxAgeMs =
    5 * 60 * 1000,
  staleMaxAgeMs =
    30 * 60 * 1000
): boolean {
  const age =
    getAdSpyResultAgeMs(
      result
    );

  return (
    age >
      freshMaxAgeMs &&
    age <=
      staleMaxAgeMs
  );
}

/**
 * Determine whether a result should no longer be reused.
 */
export function isAdSpyResultExpired(
  result:
    | AdSpySearchResult
    | AdSpyCachedResult,
  staleMaxAgeMs =
    30 * 60 * 1000
): boolean {
  return (
    getAdSpyResultAgeMs(
      result
    ) >
    staleMaxAgeMs
  );
}

/* =========================================================
 * DEFAULT EMPTY RESULT
 * ======================================================= */

/**
 * Useful for predictable initialization in the API/UI.
 */
export function createEmptyAdSpyIntelligence(): AdSpyIntelligence {
  return {
    summary: {}as AdSearchSummary,
    creativeFamilies: {
      families: [],
      summary: {
        familyCount: 0,
        totalVariants: 0,
        largestFamily: null,
        mostCommonOffer: null,
        creatorFamilies: 0,
        videoFamilies: 0,
        carouselFamilies: 0,
      },
    },

    creators: {
      analyses: [],
      summary:
        {} as CreatorAnalysisSummary,
    },

    video: {
      analyses: [],
      summary:
        {} as VideoAnalysisSummary,
    },

    marketing: {
      analyses: [],
      summary:
        {} as MarketingAnalysisSummary,
    },

    topOffers: [],

    hookPatterns: [],

    recommendedExperiments: [],
  };
}

/* =========================================================
 * DEFAULT PAGINATION
 * ======================================================= */

export function createEmptyAdSpyPagination(
  limit = 20
): AdSpyPagination {
  return {
    page: 1,

    limit,

    total: 0,

    totalPages: 0,

    hasNextPage: false,

    hasPreviousPage: false,

    nextPage: null,

    previousPage: null,
  };
}