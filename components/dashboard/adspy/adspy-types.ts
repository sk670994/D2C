export type Platform =
  | "meta"
  | "google"
  | "linkedin";

export type SearchMode =
  | "advertiser"
  | "keyword";

export type Ad = {
  id: string;

  platform: Platform;

  advertiserName?:
    | string
    | null;

  advertiserId?:
    | string
    | null;

  creatorName?:
    | string
    | null;

  partnershipType?:
    | string
    | null;

  country?:
    | string
    | null;

  creativeType?:
    | string
    | null;

  imageUrl?:
    | string
    | null;

  videoUrl?:
    | string
    | null;

  thumbnailUrl?:
    | string
    | null;

  videoDurationSeconds?:
    | number
    | null;

  primaryText?:
    | string
    | null;

  headline?:
    | string
    | null;

  description?:
    | string
    | null;

  callToAction?:
    | string
    | null;

  firstSeen?:
    | string
    | null;

  lastSeen?:
    | string
    | null;

  isActive?:
    | boolean
    | null;

  publisherPlatforms?:
    string[];

  landingPage?:
    | string
    | null;

  sourceUrl?:
    | string
    | null;

  productName?:
    | string
    | null;

  productPrice?:
    | number
    | null;

  maxPrice?:
    | number
    | null;

  currency?:
    | string
    | null;

  offer?:
    | string
    | null;

  runningDays?:
    | number
    | null;

  transcript?:
    | string
    | null;

  transcriptStatus?:
    | string
    | null;

  metadata?:
    Record<string, unknown> | null;

  brandId?:
    | string
    | null;

  dataProvenance?:
    Record<string, unknown> | null;

  languages?: Array<{
    code: string;
    name: string;
    source:
      | "provider"
      | "heuristic";
    confidence?:
      | number
      | null;
  }>;

  markets?: Array<{
    countryCode?:
      | string
      | null;

    countryName?:
      | string
      | null;

    stateName?:
      | string
      | null;

    cityName?:
      | string
      | null;

    regionName?:
      | string
      | null;

    source:
      | "provider"
      | "derived";

    confidence?:
      | number
      | null;
  }>;

  creativeScore?:
    | number
    | null;

  impressions?:
    | number
    | null;

  reach?:
    | number
    | null;

  clicks?:
    | number
    | null;

  ctr?:
    | number
    | null;
};

export type AutocompleteAdvertiser = {
  id: string;

  pageId: string;

  label: string;

  type: "advertiser";

  domain?:
    | string
    | null;

  profileUrl?:
    | string
    | null;

  profileImageUrl?:
    | string
    | null;

  category?:
    | string
    | null;

  verification?:
    | string
    | null;

  likes?:
    | number
    | null;

  igFollowers?:
    | number
    | null;
};

export type Job = {
  id: string;

  status: string;

  stage: string;

  discoveredAds: number;

  normalizedAds: number;

  persistedAds: number;

  errorMessage?:
    | string
    | null;
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
  topCreators: Array<{
    label: string;
    count: number;
  }>;

  topOffers: Array<{
    label: string;
    count: number;
  }>;

  topHooks: Array<{
    label: string;
    count: number;
  }>;

  longestRunningAd: {
    advertiserName?:
      | string
      | null;

    headline?:
      | string
      | null;

    runningDays?:
      | number
      | null;
  } | null;

  reach: {
    status: "unavailable";

    reason: string;
  };
};

export type SearchResponse = {
  success: boolean;

  query?:
    | string
    | undefined;

  country?:
    | string
    | undefined;

  platform?:
    | Platform
    | undefined;

  mode?:
    | SearchMode
    | undefined;

  pageId?:
    | string
    | null
    | undefined;

  ads?:
    | Ad[]
    | undefined;

  total?:
    | number
    | undefined;

  page?:
    | number
    | undefined;

  limit?:
    | number
    | undefined;

  totalPages?:
    | number
    | undefined;

  summary?:
    | Summary
    | undefined;

  intelligence?:
    | Intelligence
    | null
    | undefined;

  lastUpdatedAt?:
    | string
    | null
    | undefined;

  isRefreshing?:
    | boolean
    | undefined;

  collectionJobId?:
    | string
    | null
    | undefined;

  collectionJob?:
    | Job
    | null
    | undefined;

  error?:
    | string
    | undefined;
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
  [
    "all",
    "All",
  ],

  [
    "active",
    "Active",
  ],

  [
    "video",
    "Video",
  ],

  [
    "image",
    "Image",
  ],

  [
    "carousel",
    "Carousel",
  ],

  [
    "creator",
    "Creators",
  ],

  [
    "longest",
    "Longest running",
  ],
] as const;

export type FilterId =
  (typeof FILTERS)[number][0];

export const ACTIVE_STATUSES =
  new Set([
    "queued",
    "scraping",
    "normalizing",
    "enriching",
    "finalizing",
  ]);

export function isActiveJob(
  status?:
    | string
    | null,
) {
  return Boolean(
    status &&
      ACTIVE_STATUSES.has(
        status,
      ),
  );
}