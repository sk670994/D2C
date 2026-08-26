import "server-only";

import type { CompetitorAd } from "@/lib/ad-intelligence/types";
import { ingestGlobalAds } from "@/lib/ad-intelligence/global/ingest";

export async function processAdChunk(input: {
  ads: CompetitorAd[];
}) {
  if (!input.ads.length) {
    return {
      insertedOrUpdated: 0,
      observations: 0,
      languages: 0,
      markets: 0,
    };
  }

  return ingestGlobalAds(input.ads);
}
