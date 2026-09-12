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

  /**
   * Exact Meta/Facebook Page ID selected from advertiser
   * autocomplete.
   *
   * When supplied for Meta advertiser searches, the provider
   * MUST search by this exact Page ID instead of relying on
   * advertiser-name matching.
   */
  advertiserPageId?: string | null;
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