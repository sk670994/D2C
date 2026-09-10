import "server-only";

import { adProviders } from "@/lib/ad-intelligence/providers";

import type {
  AdPlatform,
  CompetitorAd,
} from "@/lib/ad-intelligence/types";

import type {
  AdSearchMode,
  CollectionDepth,
} from "@/lib/ad-intelligence/provider";

import {
  getCollectionJob,
  markTrackedBrandCollected,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import { processAdChunk } from "./process-ad-chunk";

const CHUNK_SIZE = 50;

export type CollectionEvent = {
  jobId: string;
  query: string;
  country: string;
  platform: AdPlatform;
  mode: AdSearchMode;
  collectionKey: string;
  collectionDepth?: CollectionDepth;
};

type PersistState = {
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
};

export async function collectAdIntelligence(
  data: CollectionEvent,
): Promise<{
  jobId: string;
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
}> {
  /*
   * Vercel Queues provides at-least-once delivery.
   *
   * Always check the current job state before starting a new
   * collection so a successfully completed job is not scraped
   * again when the same message is redelivered.
   */
  const existingJob = await getCollectionJob(data.jobId);

  if (!existingJob) {
    throw new Error(
      `Collection job ${data.jobId} was not found.`,
    );
  }

  if (existingJob.status === "complete") {
    return {
      jobId: existingJob.id,
      discoveredAds: Number(
        existingJob.discoveredAds ?? 0,
      ),
      normalizedAds: Number(
        existingJob.normalizedAds ?? 0,
      ),
      persistedAds: Number(
        existingJob.persistedAds ?? 0,
      ),
    };
  }

  /*
   * Normalize the requested collection depth.
   *
   * Any value other than explicit "quick" is treated as deep.
   * This keeps the worker backward-compatible with existing
   * queue messages that may not contain collectionDepth.
   */
  const collectionDepth: "quick" | "deep" =
    data.collectionDepth === "quick"
      ? "quick"
      : "deep";

  const startedAt = new Date().toISOString();

  try {
    /*
     * Mark the job as actively processing.
     */
    await updateCollectionJob(data.jobId, {
      status: "scraping",
      stage: "scraping",
      startedAt,
      errorMessage: null,
    });

    const state: PersistState = {
      discoveredAds: 0,
      normalizedAds: 0,
      persistedAds: 0,
    };

    /*
     * Persist provider results in bounded chunks.
     *
     * This prevents one large provider response from becoming
     * one very large database operation and allows the collection
     * job to expose incremental progress.
     */
    const persistProviderResult = async (
      phase: "quick" | "deep",
      ads: CompetitorAd[],
    ): Promise<void> => {
      state.discoveredAds += ads.length;

      /*
       * No chunks are required when the provider returns zero ads.
       */
      if (ads.length === 0) {
        await updateCollectionJob(data.jobId, {
          status: "enriching",
          stage: "enriching",
          discoveredAds: state.discoveredAds,
          normalizedAds: state.normalizedAds,
          persistedAds: state.persistedAds,
        });

        return;
      }

      const totalChunks = Math.ceil(
        ads.length / CHUNK_SIZE,
      );

      for (
        let offset = 0;
        offset < ads.length;
        offset += CHUNK_SIZE
      ) {
        const chunkIndex =
          Math.floor(offset / CHUNK_SIZE) + 1;

        const chunk = ads.slice(
          offset,
          offset + CHUNK_SIZE,
        );

        const result = await processAdChunk({
          ads: chunk,
        });

        state.normalizedAds += chunk.length;

        state.persistedAds += Number(
          result.insertedOrUpdated ?? 0,
        );

        const finalChunk =
          chunkIndex === totalChunks;

        const isFinalDeepChunk =
          phase === "deep" && finalChunk;

        await updateCollectionJob(
          data.jobId,
          {
            status: isFinalDeepChunk
              ? "finalizing"
              : "enriching",

            stage: isFinalDeepChunk
              ? "finalizing"
              : "enriching",

            discoveredAds:
              state.discoveredAds,

            normalizedAds:
              state.normalizedAds,

            persistedAds:
              state.persistedAds,
          },
        );
      }
    };

    /*
     * Execute the provider collection for exactly ONE phase.
     *
     * IMPORTANT:
     *
     * quick = quick provider search only
     * deep  = deep provider search only
     *
     * We intentionally do NOT run:
     *
     * quick -> deep
     *
     * inside the same queue job.
     *
     * If a deep refresh is required, it should be dispatched as
     * a separate deep queue event.
     */
    const collectPhase = async (
      phase: "quick" | "deep",
    ): Promise<{
      ads: CompetitorAd[];
    }> => {
      const provider =
        adProviders[data.platform];

      if (!provider) {
        throw new Error(
          `No provider configured for ${data.platform}.`,
        );
      }

      const result =
        await provider.search({
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
        });

      return {
        ads: result.ads ?? [],
      };
    };

    /*
     * ---------------------------------------------------------
     * SINGLE COLLECTION PHASE
     * ---------------------------------------------------------
     *
     * The queue message determines whether this invocation
     * performs quick or deep collection.
     */
    const result =
      await collectPhase(collectionDepth);

    await persistProviderResult(
      collectionDepth,
      result.ads,
    );

    /*
     * Quick collection returning zero ads is not treated as a
     * failure. The provider successfully completed its search;
     * it simply found nothing during the quick pass.
     *
     * A separate deep job can be dispatched by the caller when
     * deeper verification is required.
     */
    if (
      collectionDepth === "quick" &&
      result.ads.length === 0
    ) {
      console.info(
        "[AdIntelligenceJob] Quick collection returned zero ads.",
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          jobId: data.jobId,
        },
      );
    }

    /*
     * ---------------------------------------------------------
     * SUCCESSFUL COMPLETION
     * ---------------------------------------------------------
     */
    await updateCollectionJob(data.jobId, {
      status: "complete",
      stage: "complete",

      discoveredAds:
        state.discoveredAds,

      normalizedAds:
        state.normalizedAds,

      persistedAds:
        state.persistedAds,

      completedAt:
        new Date().toISOString(),

      errorMessage: null,
    });

    /*
     * Update tracked-brand metadata only after the collection
     * phase has completed successfully.
     */
    await markTrackedBrandCollected({
      query: data.query,
      country: data.country,
      platform: data.platform,
    });

    return {
      jobId: data.jobId,

      discoveredAds:
        state.discoveredAds,

      normalizedAds:
        state.normalizedAds,

      persistedAds:
        state.persistedAds,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Collection failed.";

    /*
     * Best-effort failure state update.
     *
     * The original error is deliberately rethrown so the queue
     * infrastructure can treat the delivery as failed and retry
     * it according to its configured retry policy.
     */
    try {
      await updateCollectionJob(data.jobId, {
        status: "failed",
        stage: "failed",
        errorMessage,
        completedAt:
          new Date().toISOString(),
      });
    } catch (updateError) {
      console.error(
        "[AdIntelligenceJob] Failed to mark collection job failed:",
        updateError,
      );
    }

    throw error;
  }
}