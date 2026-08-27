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
       * Persist one provider result in chunks and update the
       * collection job after every chunk.
       *
       * The quick phase intentionally uses distinct Inngest
       * step IDs from the deep phase so a quick-first job can
       * continue into a deep refresh without colliding with
       * cached step results.
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
       * QUICK-FIRST mode:
       *
       * The first request returns a small, fast Meta crawl.
       * Those records are persisted immediately. Only then do
       * we start the deeper crawl.
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
      }

      /*
       * DEEP mode:
       *
       * This is the existing full collection path.
       * In quick-first mode it starts only after the quick
       * batch has been persisted, so the user can see the
       * first results while this phase runs.
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
       * A search can legitimately return zero ads.
       * In that case the collection is still complete.
       */
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

      /*
       * Update tracking metadata after
       * a successful collection.
       *
       * This is intentionally based on
       * the tracked query/country/platform
       * because the collection event does
       * not currently carry a tracked-brand UUID.
       */
      await step.run(
        "mark-tracked-brand-collected",
        async () => {
          await markTrackedBrandCollected({
            query:
              data.query,
            country:
              data.country,
            platform:
              data.platform,
          });
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
    },
  );
