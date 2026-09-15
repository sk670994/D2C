import "server-only";

import { send } from "@vercel/queue";
import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform, CompetitorAd } from "@/lib/ad-intelligence/types";
import type { AdSearchMode, CollectionDepth } from "@/lib/ad-intelligence/provider";
import { getCollectionJob, markTrackedBrandCollected, updateCollectionJob } from "@/lib/ad-intelligence/global/store";
import { processAdChunk } from "./process-ad-chunk";

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

type State = { discoveredAds: number; normalizedAds: number; persistedAds: number };

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

async function dispatchDeep(data: CollectionEvent) {
  const deepPayload: CollectionEvent = { ...data, collectionDepth: "deep" };
  const idempotencyKey = `${data.collectionKey}:deep`;
  if (process.env.VERCEL) {
    await send("adspy-collection", deepPayload, { idempotencyKey, retentionSeconds: 24 * 60 * 60 });
    return;
  }
  setTimeout(() => {
    void collectAdIntelligence(deepPayload).catch((error) => {
      console.error("[AdSpy deep] Inline collection failed", { jobId: data.jobId, error: error instanceof Error ? error.message : error });
    });
  }, 0);
}

export async function collectAdIntelligence(data: CollectionEvent): Promise<State & { jobId: string }> {
  const job = await getCollectionJob(data.jobId);
  if (!job) throw new Error(`Collection job ${data.jobId} was not found.`);

  const phase: Phase = data.platform === "meta" && data.collectionDepth === "deep" ? "deep" : data.platform === "meta" ? "quick" : "deep";

  if (phase === "quick") {
    if (["deep_queued", "deep", "exhausted", "complete", "stale", "cancelled"].includes(job.status)) {
      return { jobId: job.id, discoveredAds: job.discoveredAds, normalizedAds: job.normalizedAds, persistedAds: job.persistedAds };
    }
  }
  if (phase === "deep" && ["complete", "exhausted"].includes(job.status)) {
    return { jobId: job.id, discoveredAds: job.discoveredAds, normalizedAds: job.normalizedAds, persistedAds: job.persistedAds };
  }

  const state: State = {
    discoveredAds: Number(job.discoveredAds ?? 0),
    normalizedAds: Number(job.normalizedAds ?? 0),
    persistedAds: Number(job.persistedAds ?? 0),
  };
  const seenIds = new Set<string>();

  const persist = async (incoming: CompetitorAd[]) => {
    const ads = uniqueBatch(incoming, seenIds);
    if (!ads.length) return;

    state.discoveredAds += ads.length;
    for (let offset = 0; offset < ads.length; offset += CHUNK_SIZE) {
      const chunk = ads.slice(offset, offset + CHUNK_SIZE);
      const batchStartedAt = Date.now();
      const result = await processAdChunk({ ads: chunk });
      state.normalizedAds += chunk.length;
      state.persistedAds += Number(result.insertedOrUpdated ?? 0);
      await updateCollectionJob(data.jobId, {
        status: phase === "quick" ? "scraping" : "deep",
        stage: phase === "quick" ? "scraping" : "deep",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });
      console.info("[ADSPY_COLLECTION_BATCH]", {
        jobId: data.jobId,
        query: data.query,
        phase,
        batchSize: chunk.length,
        discovered: state.discoveredAds,
        persisted: state.persistedAds,
        durationMs: Date.now() - batchStartedAt,
      });
    }
  };

  try {
    await updateCollectionJob(data.jobId, {
      status: phase === "quick" ? "scraping" : "deep",
      stage: phase === "quick" ? "scraping" : "deep",
      startedAt: phase === "quick" ? new Date().toISOString() : job.startedAt ?? new Date().toISOString(),
      errorMessage: null,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
    });

    if (!adProviders[data.platform]) throw new Error(`No provider configured for ${data.platform}.`);

    console.info("[ADSPY_COLLECTION_START]", {
      jobId: data.jobId,
      query: data.query,
      country: data.country,
      platform: data.platform,
      mode: data.mode,
      phase,
      advertiserPageId: data.advertiserPageId ?? null,
    });

    if (data.platform === "meta") {
      await import("@/lib/ad-intelligence/providers/deep-meta").then(async ({ collectMetaAdsInBatches }) => {
        await collectMetaAdsInBatches(
          {
            query: data.query,
            country: data.country,
            platform: data.platform,
            mode: data.mode,
            collectionDepth: phase,
            advertiserPageId: data.advertiserPageId ?? null,
          },
          async (batch) => persist(batch),
        );
      });
    } else {
      const result = await adProviders[data.platform]!.search({
        query: data.query,
        country: data.country,
        platform: data.platform,
        mode: data.mode,
        collectionDepth: phase,
        advertiserPageId: data.advertiserPageId ?? null,
      });
      await persist(result.ads ?? []);
    }

    if (phase === "quick" && data.platform === "meta") {
      await updateCollectionJob(data.jobId, {
        status: "deep_queued",
        stage: "deep_queued",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });
      await dispatchDeep(data);
      console.info("[ADSPY_COLLECTION_RESTART]", { jobId: data.jobId, phase: "deep" });
      return { jobId: data.jobId, ...state };
    }

    await updateCollectionJob(data.jobId, {
      status: "exhausted",
      stage: "exhausted",
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
      completedAt: new Date().toISOString(),
      errorMessage: null,
    });
    await markTrackedBrandCollected({ query: data.query, country: data.country, platform: data.platform });
    console.info("[ADSPY_COLLECTION_COMPLETE]", { jobId: data.jobId, phase, persisted: state.persistedAds });
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
    }).catch((updateError) => console.error("[AdSpy] failed-state update failed", updateError));
    console.error("[ADSPY_COLLECTION_FAILED]", { jobId: data.jobId, phase, error: message });
    throw error;
  }
}
