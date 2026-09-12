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

  /**
   * Exact Meta Page ID selected by the user.
   *
   * This value must survive:
   *
   * AdSpySection
   *   -> /api/ad-intelligence/refresh
   *   -> Vercel Queue
   *   -> collectAdIntelligence
   *   -> provider.search
   *   -> deepMetaProvider
   */
  advertiserPageId?: string | null;
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
  const existingJob =
    await getCollectionJob(
      data.jobId,
    );

  if (!existingJob) {
    throw new Error(
      `Collection job ${data.jobId} was not found.`,
    );
  }

  /*
   * Vercel Queue is at-least-once delivery.
   *
   * Do not scrape a job that has already completed.
   */
  if (
    existingJob.status ===
    "complete"
  ) {
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

  const collectionDepth:
    | "quick"
    | "deep" =
    data.collectionDepth ===
    "quick"
      ? "quick"
      : "deep";

  const startedAt =
    new Date().toISOString();

  try {
    await updateCollectionJob(
      data.jobId,
      {
        status: "scraping",
        stage: "scraping",
        startedAt,
        errorMessage: null,
      },
    );

    const state: PersistState = {
      discoveredAds: 0,
      normalizedAds: 0,
      persistedAds: 0,
    };

    const persistProviderResult =
      async (
        phase:
          | "quick"
          | "deep",
        ads: CompetitorAd[],
      ): Promise<void> => {
        state.discoveredAds +=
          ads.length;

        if (
          ads.length === 0
        ) {
          await updateCollectionJob(
            data.jobId,
            {
              status:
                "enriching",

              stage:
                "enriching",

              discoveredAds:
                state.discoveredAds,

              normalizedAds:
                state.normalizedAds,

              persistedAds:
                state.persistedAds,
            },
          );

          return;
        }

        const totalChunks =
          Math.ceil(
            ads.length /
              CHUNK_SIZE,
          );

        for (
          let offset = 0;
          offset <
          ads.length;
          offset +=
            CHUNK_SIZE
        ) {
          const chunkIndex =
            Math.floor(
              offset /
                CHUNK_SIZE,
            ) + 1;

          const chunk =
            ads.slice(
              offset,
              offset +
                CHUNK_SIZE,
            );

          const result =
            await processAdChunk(
              {
                ads: chunk,
              },
            );

          state.normalizedAds +=
            chunk.length;

          state.persistedAds +=
            Number(
              result.insertedOrUpdated ??
                0,
            );

          const finalChunk =
            chunkIndex ===
            totalChunks;

          const isFinalDeepChunk =
            phase ===
              "deep" &&
            finalChunk;

          await updateCollectionJob(
            data.jobId,
            {
              status:
                isFinalDeepChunk
                  ? "finalizing"
                  : "enriching",

              stage:
                isFinalDeepChunk
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
     * Execute exactly one collection phase.
     */
    const collectPhase =
      async (
        phase:
          | "quick"
          | "deep",
      ): Promise<{
        ads: CompetitorAd[];
      }> => {
        const provider =
          adProviders[
            data.platform
          ];

        if (!provider) {
          throw new Error(
            `No provider configured for ${data.platform}.`,
          );
        }

        /*
         * IMPORTANT:
         *
         * advertiserPageId is explicitly forwarded here.
         *
         * This was previously missing and caused the background
         * worker to lose the selected Meta Page ID.
         */
        const result =
          await provider.search(
            {
              query:
                data.query,

              country:
                data.country,

              platform:
                data.platform,

              mode:
                data.mode,

              collectionDepth:
                phase,

              advertiserPageId:
                data.advertiserPageId ??
                undefined,
            },
          );

        return {
          ads:
            result.ads ??
            [],
        };
      };

    console.info(
      "[AdIntelligenceJob] Starting collection:",
      {
        jobId:
          data.jobId,

        query:
          data.query,

        country:
          data.country,

        platform:
          data.platform,

        mode:
          data.mode,

        collectionDepth,

        advertiserPageId:
          data.advertiserPageId ??
          null,
      },
    );

    const result =
      await collectPhase(
        collectionDepth,
      );

    await persistProviderResult(
      collectionDepth,
      result.ads,
    );

    if (
      collectionDepth ===
        "quick" &&
      result.ads.length === 0
    ) {
      console.warn(
        "[AdIntelligenceJob] Quick collection returned zero ads.",
        {
          jobId:
            data.jobId,

          query:
            data.query,

          country:
            data.country,

          platform:
            data.platform,

          mode:
            data.mode,

          advertiserPageId:
            data.advertiserPageId ??
            null,
        },
      );
    }

    await updateCollectionJob(
      data.jobId,
      {
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
      },
    );

    await markTrackedBrandCollected(
      {
        query:
          data.query,

        country:
          data.country,

        platform:
          data.platform,
      },
    );

    return {
      jobId:
        data.jobId,

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

    try {
      await updateCollectionJob(
        data.jobId,
        {
          status: "failed",

          stage: "failed",

          errorMessage,

          completedAt:
            new Date().toISOString(),
        },
      );
    } catch (
      updateError
    ) {
      console.error(
        "[AdIntelligenceJob] Failed to mark collection job failed:",
        updateError,
      );
    }

    throw error;
  }
}