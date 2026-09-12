export type Platform = "meta" | "google" | "linkedin";
export type SearchMode = "advertiser" | "keyword";

export type Ad = {
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

export type AutocompleteAdvertiser = {
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

export type Job = {
  id: string;
  status: string;
  stage: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  errorMessage?: string | null;
};

export type Summary = {
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

export type Intelligence = {
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

export type SearchResponse = {
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

export const EMPTY_SUMMARY: Summary = {
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

export const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["video", "Video"],
  ["image", "Image"],
  ["carousel", "Carousel"],
  ["creator", "Creators"],
  ["longest", "Longest running"],
] as const;

export type FilterId = (typeof FILTERS)[number][0];

export const ACTIVE_STATUSES = new Set([
  "queued",
  "scraping",
  "normalizing",
  "enriching",
  "finalizing",
]);

export function isActiveJob(status?: string | null) {
  return Boolean(status && ACTIVE_STATUSES.has(status));
}

