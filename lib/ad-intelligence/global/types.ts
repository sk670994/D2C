import type { AdPlatform, CompetitorAd } from "../types";

export type DataSource = "provider" | "heuristic" | "derived" | "unavailable";

export type GlobalLanguage = {
  code: string;
  name: string;
  count: number;
  share: number;
  source: DataSource;
};

export type GlobalMarket = {
  countryCode: string;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
  regionName: string | null;
  count: number;
  share: number;
  source: DataSource;
};

export type GlobalAdRecord = CompetitorAd & {
  brandId?: string | null;
  dataProvenance?: Record<string, DataSource>;
  languages?: Array<{
    code: string;
    name: string;
    source: DataSource;
    confidence?: number | null;
  }>;
  markets?: Array<{
    countryCode: string;
    countryName?: string | null;
    stateName?: string | null;
    cityName?: string | null;
    regionName?: string | null;
    source: DataSource;
    confidence?: number | null;
  }>;
};

export type GlobalSearchSummary = {
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

export type GlobalSearchResult = {
  ads: GlobalAdRecord[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  languages: GlobalLanguage[];
  markets: GlobalMarket[];
  summary: GlobalSearchSummary;
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
  collectionJobId: string | null;
};

export type CollectionJobStatus =
  | "queued"
  | "scraping"
  | "normalizing"
  | "enriching"
  | "finalizing"
  | "complete"
  | "failed";

export type CollectionJob = {
  id: string;
  collectionKey: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: "advertiser" | "keyword";
  status: CollectionJobStatus;
  stage: CollectionJobStatus;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastRequestedAt: string;
  updatedAt: string;
  createdAt: string;
};
