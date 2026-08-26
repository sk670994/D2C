import "server-only";

import { inngest } from "@/inngest/client";

import { adProviders } from "@/lib/ad-intelligence/providers";

import type { AdPlatform } from "@/lib/ad-intelligence/types";

import type { AdSearchMode } from "@/lib/ad-intelligence/provider";

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

      const providerResult =
        await step.run(
          "collect-public-creatives",
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
                query: data.query,
                country: data.country,
                platform:
                  data.platform,
                mode: data.mode,
              });

            return {
              ads: result.ads ?? [],
            };
          },
        );

      const ads =
        providerResult.ads ?? [];

      await step.run(
        "record-discovery",
        async () => {
          await updateCollectionJob(
            data.jobId,
            {
              status: "normalizing",
              stage: "normalizing",
              discoveredAds:
                ads.length,
              normalizedAds: 0,
              persistedAds: 0,
            },
          );
        },
      );

      let persistedAds = 0;
      let normalizedAds = 0;

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
            offset + CHUNK_SIZE,
          );

        const result =
          await step.run(
            `persist-chunk-${chunkIndex}`,
            async () =>
              processAdChunk({
                ads: chunk,
              }),
          );

        normalizedAds +=
          chunk.length;

        persistedAds +=
          Number(
            result.insertedOrUpdated ??
              0,
          );

        await step.run(
          `progress-${chunkIndex}`,
          async () => {
            const finalChunk =
              chunkIndex ===
              totalChunks;

            await updateCollectionJob(
              data.jobId,
              {
                status: finalChunk
                  ? "finalizing"
                  : "enriching",

                stage: finalChunk
                  ? "finalizing"
                  : "enriching",

                normalizedAds,
                persistedAds,
              },
            );
          },
        );
      }

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
                ads.length,

              normalizedAds,

              persistedAds,

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
            query: data.query,
            country: data.country,
            platform: data.platform,
          });
        },
      );

      return {
        jobId: data.jobId,
        discoveredAds: ads.length,
        normalizedAds,
        persistedAds,
      };
    },
  );