import "server-only";

import { inngest } from "@/inngest/client";

import { adProviders } from "@/lib/ad-intelligence/providers";

import type { AdPlatform } from "@/lib/ad-intelligence/types";
import type { AdSearchMode } from "@/lib/ad-intelligence/provider";

import {
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

type FailureEnvelope = {
  data?: {
    event?: {
      data?: unknown;
    };
  };
};

function extractFailureCollectionEvent(
  input: unknown,
): Partial<CollectionEvent> | null {
  const envelope =
    input as FailureEnvelope;

  const payload =
    envelope?.data?.event?.data;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record =
    payload as Record<string, unknown>;

  return {
    jobId:
      typeof record.jobId === "string"
        ? record.jobId
        : undefined,

    query:
      typeof record.query === "string"
        ? record.query
        : undefined,

    country:
      typeof record.country === "string"
        ? record.country
        : undefined,

    platform:
      typeof record.platform === "string"
        ? (record.platform as AdPlatform)
        : undefined,

    mode:
      typeof record.mode === "string"
        ? (record.mode as AdSearchMode)
        : undefined,

    collectionKey:
      typeof record.collectionKey === "string"
        ? record.collectionKey
        : undefined,
  };
}

export const collectAdIntelligence =
  inngest.createFunction(
    {
      id:
        "zooptrack-collect-ad-intelligence",

      retries: 2,

      onFailure: async ({
        event,
        error,
      }) => {
        const data =
          extractFailureCollectionEvent(
            event,
          );

        if (!data?.jobId) {
          console.error(
            "[AdIntelligenceJob] Failure event did not contain a valid jobId.",
          );

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
            "[AdIntelligenceJob] Failed to mark job as failed:",
            updateError,
          );
        }
      },
    },

    {
      event:
        "zooptrack/ad-intelligence.collection.requested",
    },

    async ({
      event,
      step,
    }) => {
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
                platform: data.platform,
                mode: data.mode,
              });

            return {
              ads:
                result.ads ?? [],
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
            offset +
              CHUNK_SIZE,
          );

        const result =
          await step.run(
            `persist-chunk-${chunkIndex}`,
            async () => {
              return processAdChunk({
                ads: chunk,
              });
            },
          );

        normalizedAds +=
          chunk.length;

        persistedAds +=
          Number(
            result.insertedOrUpdated ??
              0,
          );

        const isLastChunk =
          chunkIndex ===
          totalChunks;

        await step.run(
          `progress-${chunkIndex}`,
          async () => {
            await updateCollectionJob(
              data.jobId,
              {
                status:
                  isLastChunk
                    ? "finalizing"
                    : "enriching",

                stage:
                  isLastChunk
                    ? "finalizing"
                    : "enriching",

                normalizedAds,
                persistedAds,
              },
            );
          },
        );
      }

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

      return {
        jobId: data.jobId,
        discoveredAds:
          ads.length,
        normalizedAds,
        persistedAds,
      };
    },
  );