import type {
  AdPlatform,
  CompetitorAd,
} from "./types";

export type AdSearchMode =
  | "advertiser"
  | "keyword";

export type CollectionDepth =
  | "quick"
  | "deep";

export type AdSearchInput = {
  query: string;

  country?: string;

  platform?: AdPlatform;

  mode?: AdSearchMode;

  page?: number;

  limit?: number;

  collectionDepth?: CollectionDepth;
};

export type ProviderResult = {
  ads: CompetitorAd[];
};

export interface AdProvider {
  platform: AdPlatform;

  search(
    input: AdSearchInput
  ): Promise<ProviderResult>;
}

export type {
  AdPlatform,
  CompetitorAd,
};
