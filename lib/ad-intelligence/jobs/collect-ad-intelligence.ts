import "server-only";

import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform, CompetitorAd } from "@/lib/ad-intelligence/types";
import type { AdSearchMode, CollectionDepth } from "@/lib/ad-intelligence/provider";
import {
  getCollectionJob,
  markTrackedBrandCollected,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";
import { processAdChunk } from "./process-ad-chunk";
import { collectMetaAdsInBatches } from "@/lib/ad-intelligence/providers/deep-meta";

const CHUNK_SIZE = 25;

type Phase = "quick" | "deep";

export type CollectionEvent = {
  jobId: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;
  collectionKey: string;
  collectionDepth?: CollectionDepth;
  advertiserPageId?: string | null;
};

type State = {
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
};

function uniqueBatch(ads: CompetitorAd[], seen: Set<string>): CompetitorAd[] {
  const unique: CompetitorAd[] = [];
  for (const ad of ads) {
    const id = String(ad.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(ad);
  }
  return unique;
}

export async function collectAdIntelligence(
  data: CollectionEvent,
): Promise<State & { jobId: string }> {
  const job = await getCollectionJob(data.jobId);
  if (!job) throw new Error(`Collection job ${data.jobId} was not found.`);

  if (job.status === "complete") {
    return {
      jobId: job.id,
      discoveredAds: Number(job.discoveredAds ?? 0),
      normalizedAds: Number(job.normalizedAds ?? 0),
      persistedAds: Number(job.persistedAds ?? 0),
    };
  }

  const initialDepth: Phase =
    data.platform === "meta" && data.collectionDepth === "quick"
      ? "quick"
      : "deep";

  const state: State = {
    discoveredAds: 0,
    normalizedAds: 0,
    persistedAds: 0,
  };

  const seenIds = new Set<string>();

  const persist = async (phase: Phase, incoming: CompetitorAd[]) => {
    const ads = uniqueBatch(incoming, seenIds);
    if (!ads.length) return;

    state.discoveredAds += ads.length;

    for (let offset = 0; offset < ads.length; offset += CHUNK_SIZE) {
      const chunk = ads.slice(offset, offset + CHUNK_SIZE);
      const result = await processAdChunk({ ads: chunk });

      state.normalizedAds += chunk.length;
      state.persistedAds += Number(result.insertedOrUpdated ?? 0);

      await updateCollectionJob(data.jobId, {
        status: phase === "deep" ? "enriching" : "scraping",
        stage: phase === "deep" ? "enriching" : "scraping",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });

      console.info("[AdIntelligenceJob] batch persisted", {
        jobId: data.jobId,
        query: data.query,
        phase,
        batchSize: chunk.length,
        discoveredAds: state.discoveredAds,
        persistedAds: state.persistedAds,
      });
    }
  };

  try {
    await updateCollectionJob(data.jobId, {
      status: "scraping",
      stage: "scraping",
      startedAt: new Date().toISOString(),
      errorMessage: null,
      discoveredAds: 0,
      normalizedAds: 0,
      persistedAds: 0,
    });

    if (!adProviders[data.platform]) {
      throw new Error(`No provider configured for ${data.platform}.`);
    }

    console.info("[AdIntelligenceJob] start", {
      jobId: data.jobId,
      query: data.query,
      country: data.country,
      platform: data.platform,
      mode: data.mode,
      initialDepth,
      advertiserPageId: data.advertiserPageId ?? null,
    });

    if (data.platform === "meta") {
      const streamInput: {
        query: string;
        country: string;
        platform: AdPlatform;
        mode: AdSearchMode;
        collectionDepth: CollectionDepth;
        advertiserPageId: string | null;
      } = {
            query: data.query,
            country: data.country,
            platform: data.platform,
            mode: data.mode,
            collectionDepth: initialDepth,
            advertiserPageId: data.advertiserPageId ?? null,
          };

      await collectMetaAdsInBatches(streamInput, async (batch) => {
        await persist(initialDepth, batch);
      });

      if (initialDepth === "quick") {
        await updateCollectionJob(data.jobId, {
          status: "scraping",
          stage: "scraping",
          discoveredAds: state.discoveredAds,
          normalizedAds: state.normalizedAds,
          persistedAds: state.persistedAds,
        });

        await collectMetaAdsInBatches(
          { ...streamInput, collectionDepth: "deep" },
          async (batch) => {
            await persist("deep", batch);
          },
        );
      }
    } else {
      const result = await adProviders[data.platform]!.search({
        query: data.query,
        country: data.country,
        platform: data.platform,
        mode: data.mode,
        collectionDepth: initialDepth,
        advertiserPageId: data.advertiserPageId ?? null,
      });

      await persist(initialDepth, result.ads ?? []);
    }

    await updateCollectionJob(data.jobId, {
      status: "complete",
      stage: "complete",
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
      completedAt: new Date().toISOString(),
      errorMessage: null,
    });

    await markTrackedBrandCollected({
      query: data.query,
      country: data.country,
      platform: data.platform,
    });

    return { jobId: data.jobId, ...state };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Collection failed.";

    await updateCollectionJob(data.jobId, {
      status: "failed",
      stage: "failed",
      errorMessage: message,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
      completedAt: new Date().toISOString(),
    }).catch((updateError) => {
      console.error("[AdIntelligenceJob] failed-state update failed", updateError);
    });

    throw error;
  }
}
