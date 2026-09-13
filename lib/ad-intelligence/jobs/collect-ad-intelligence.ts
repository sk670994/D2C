import "server-only";

import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform, CompetitorAd } from "@/lib/ad-intelligence/types";
import type { AdSearchMode, CollectionDepth } from "@/lib/ad-intelligence/provider";
import { getCollectionJob, markTrackedBrandCollected, updateCollectionJob } from "@/lib/ad-intelligence/global/store";
import { processAdChunk } from "./process-ad-chunk";

const CHUNK_SIZE = 50;

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

export async function collectAdIntelligence(data: CollectionEvent): Promise<State & { jobId: string }> {
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

  const initialDepth: Phase = data.platform === "meta" && data.collectionDepth === "quick" ? "quick" : "deep";
  const state: State = { discoveredAds: 0, normalizedAds: 0, persistedAds: 0 };

  const persist = async (phase: Phase, ads: CompetitorAd[]) => {
    state.discoveredAds += ads.length;
    if (!ads.length) {
      await updateCollectionJob(data.jobId, {
        status: phase === "quick" ? "scraping" : "enriching",
        stage: phase === "quick" ? "scraping" : "enriching",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });
      return;
    }

    const totalChunks = Math.ceil(ads.length / CHUNK_SIZE);
    for (let offset = 0; offset < ads.length; offset += CHUNK_SIZE) {
      const chunk = ads.slice(offset, offset + CHUNK_SIZE);
      const result = await processAdChunk({ ads: chunk });
      state.normalizedAds += chunk.length;
      state.persistedAds += Number(result.insertedOrUpdated ?? 0);
      const finalChunk = Math.floor(offset / CHUNK_SIZE) + 1 === totalChunks;
      await updateCollectionJob(data.jobId, {
        status: phase === "deep" && finalChunk ? "finalizing" : "enriching",
        stage: phase === "deep" && finalChunk ? "finalizing" : "enriching",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
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

    const provider = adProviders[data.platform];
    if (!provider) throw new Error(`No provider configured for ${data.platform}.`);

    const collect = async (phase: Phase) => {
      const result = await provider.search({
        query: data.query,
        country: data.country,
        platform: data.platform,
        mode: data.mode,
        collectionDepth: phase,
        advertiserPageId: data.advertiserPageId ?? null,
      });
      return result.ads ?? [];
    };

    console.info("[AdIntelligenceJob] start", {
      jobId: data.jobId,
      query: data.query,
      country: data.country,
      platform: data.platform,
      mode: data.mode,
      initialDepth,
      advertiserPageId: data.advertiserPageId ?? null,
    });

    const quickAds = await collect(initialDepth);
    await persist(initialDepth, quickAds);

    // Meta uses a quick-first UX: persist useful results, then broaden the same job in the background.
    if (data.platform === "meta" && initialDepth === "quick") {
      await updateCollectionJob(data.jobId, {
        status: "scraping",
        stage: "scraping",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });

      const deepAds = await collect("deep");
      await persist("deep", deepAds);
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
    const message = error instanceof Error ? error.message : "Collection failed.";
    await updateCollectionJob(data.jobId, {
      status: "failed",
      stage: "failed",
      errorMessage: message,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
      completedAt: new Date().toISOString(),
    }).catch((updateError) => console.error("[AdIntelligenceJob] failed-state update failed", updateError));
    throw error;
  }
}
