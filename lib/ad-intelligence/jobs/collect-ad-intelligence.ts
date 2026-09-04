import "server-only";

import { inngest } from "@/inngest/client";

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
  markTrackedBrandCollected,
  updateCollectionJob,
} from "@/lib/ad-intelligence/global/store";

import { processAdChunk } from "./process-ad-chunk";

const CHUNK_SIZE = 50;

type CollectionEvent = {
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

export const collectAdIntelligence =
  inngest.createFunction(
    {
      id: "zooptrack-collect-ad-intelligence",

      retries: 2,

      triggers: {
        event:
          "zooptrack/ad-intelligence.collection.requested",
      },

      onFailure: async ({
        event,
        error,
      }) => {
        const data =
          (
            event.data as {
              jobId?: string;
            }
          ) ?? null;

        if (!data?.jobId) {
          return;
        }

        try {
          await updateCollectionJob(
            data.jobId,
            {
              status: "failed",
              stage: "failed",
              errorMessage:
                error?.message ??
                "Collection failed.",
              completedAt:
                new Date().toISOString(),
            },
          );
        } catch (updateError) {
          console.error(
            "[AdIntelligenceJob] Failed to mark job failed:",
            updateError,
          );
        }
      },
    },

    async ({ event, step }) => {
      const data =
        event.data as CollectionEvent;

      const startedAt =
        new Date().toISOString();

      const collectionDepth =
        data.collectionDepth ===
        "quick"
          ? "quick"
          : "deep";

      await step.run(
        "mark-scraping",
        async () => {
          await updateCollectionJob(
            data.jobId,
            {
              status: "scraping",
              stage: "scraping",
              startedAt,
              errorMessage: null,
            },
          );
        },
      );

      const state: PersistState = {
        discoveredAds: 0,
        normalizedAds: 0,
        persistedAds: 0,
      };

      /*
       * Persist provider results in chunks and update the
       * collection job after every chunk.
       */
      const persistProviderResult = async (
        phase: "quick" | "deep",
        ads: CompetitorAd[],
      ) => {
        state.discoveredAds +=
          ads.length;

        const totalChunks =
          Math.max(
            1,
            Math.ceil(
              ads.length /
                CHUNK_SIZE,
            ),
          );

        for (
          let offset = 0;
          offset < ads.length;
          offset += CHUNK_SIZE
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
            await step.run(
              `persist-${phase}-chunk-${chunkIndex}`,
              async () =>
                processAdChunk({
                  ads: chunk,
                }),
            );

          state.normalizedAds +=
            chunk.length;

          state.persistedAds +=
            Number(
              result.insertedOrUpdated ??
                0,
            );

          await step.run(
            `progress-${phase}-chunk-${chunkIndex}`,
            async () => {
              const finalChunk =
                chunkIndex ===
                totalChunks;

              await updateCollectionJob(
                data.jobId,
                {
                  status:
                    finalChunk &&
                    phase === "deep"
                      ? "finalizing"
                      : "enriching",

                  stage:
                    finalChunk &&
                    phase === "deep"
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
            },
          );
        }
      };

      /*
       * Run one provider collection phase.
       */
      const collectPhase =
        async (
          phase:
            | "quick"
            | "deep",
        ) => {
          return step.run(
            `collect-public-creatives-${phase}`,
            async () => {
              const provider =
                adProviders[
                  data.platform
                ];

              if (!provider) {
                throw new Error(
                  `No provider configured for ${data.platform}.`,
                );
              }

              const result =
                await provider.search({
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
                });

              return {
                ads:
                  result.ads ??
                  [],
              };
            },
          );
        };

      /*
       * Mark the collection as complete.
       *
       * This is used both for normal completion and for
       * the quick-search-zero-results case.
       */
      const completeCollection =
        async () => {
          await step.run(
            "complete-collection",
            async () => {
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
            },
          );
        };

      /*
       * Update tracking metadata after a successful
       * collection.
       */
      const markTrackingComplete =
        async () => {
          await step.run(
            "mark-tracked-brand-collected",
            async () => {
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
            },
          );
        };

      /*
       * QUICK-FIRST MODE
       *
       * For a brand that is not already indexed, the refresh
       * route starts a quick collection.
       *
       * IMPORTANT:
       *
       * If the quick provider returns ZERO ads, we now stop
       * here instead of automatically starting an expensive
       * deep collection.
       *
       * This prevents a new/unknown brand from sitting on
       * "Updating..." for a long time.
       */
      if (
        collectionDepth ===
        "quick"
      ) {
        const quickResult =
          await collectPhase(
            "quick",
          );

        await persistProviderResult(
          "quick",
          quickResult.ads,
        );

        /*
         * QUICK SEARCH FOUND NOTHING
         *
         * Do not start the deep crawl automatically.
         *
         * The user should receive a completed "no ads found"
         * result instead of waiting for the expensive deep
         * provider crawl.
         */
        if (
          quickResult.ads.length ===
          0
        ) {
          console.info(
            "[AdIntelligenceJob] Quick collection returned zero ads; skipping deep collection.",
            {
              query:
                data.query,
              country:
                data.country,
              platform:
                data.platform,
              mode:
                data.mode,
              jobId:
                data.jobId,
            },
          );

          await completeCollection();

          await markTrackingComplete();

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
        }
      }

      /*
       * DEEP MODE
       *
       * There are two ways to reach this block:
       *
       * 1. The job was explicitly started as "deep".
       * 2. Quick collection found at least one ad.
       *
       * In the second case, quick results are already
       * persisted and visible before the deep collection
       * finishes.
       */
      const deepResult =
        await collectPhase(
          "deep",
        );

      await persistProviderResult(
        "deep",
        deepResult.ads,
      );

      /*
       * A collection that returns zero ads is still a
       * successful collection.
       */
      await completeCollection();

      await markTrackingComplete();

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
    },
  );