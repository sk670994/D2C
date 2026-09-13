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

export type AdCollectionScope =
  | "active"
  | "all";

export type AdSearchInput = {
  query: string;

  country?: string;

  platform?: AdPlatform;

  mode?: AdSearchMode;

  page?: number;

  limit?: number;

  collectionDepth?: CollectionDepth;

  advertiserPageId?: string | null;

  /**
   * Quick user search can use active ads.
   * Deep historical collection should use all ads
   * where the underlying source supports it.
   */
  collectionScope?: AdCollectionScope;
};

export type ProviderResult = {
  ads: CompetitorAd[];
};

export interface AdProvider {
  platform: AdPlatform;

  search(
    input: AdSearchInput,
  ): Promise<ProviderResult>;
}

export type {
  AdPlatform,
  CompetitorAd,
};