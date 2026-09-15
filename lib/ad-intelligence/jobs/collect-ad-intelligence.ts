import "server-only";

import { adProviders } from "@/lib/ad-intelligence/providers";
import type { AdPlatform, CompetitorAd } from "@/lib/ad-intelligence/types";
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
import { dispatchAdSpyCollection } from "./dispatch-adspy-collection";

import {
  claimAdSpyRequest,
  completeAdSpyRequest,
  enqueueAdSpyRequest,
  failAdSpyRequest,
  finishAdSpyRun,
  heartbeatAdSpyRun,
  updateAdSpyRunCounts,
} from "@/lib/ad-intelligence/durable-run";

const CHUNK_SIZE = 25;
const HEARTBEAT_MS = 15_000;

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
  runId?: string;
  requestId?: string;
};

type State = {
  discoveredAds: number;
  normalizedAds: number;
  persistedAds: number;
};

function uniqueBatch(
  ads: CompetitorAd[],
  seen: Set<string>,
): CompetitorAd[] {
  const unique: CompetitorAd[] = [];

  for (const ad of ads) {
    const id = String(ad.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(ad);
  }

  return unique;
}

async function dispatchDeep(
  data: CollectionEvent,
  runId: string,
): Promise<void> {
  const payload: CollectionEvent = {
    ...data,
    collectionDepth: "deep",
    runId,
  };

  const request = await enqueueAdSpyRequest({
    runId,
    uniqueKey: `${data.collectionKey}:deep`,
    requestType: "deep",
    payload,
    priority: 50,
    maxAttempts: 5,
  });

  await dispatchAdSpyCollection(
    {
      ...payload,
      requestId: request.id,
    },
    `${data.collectionKey}:deep:${runId}`,
  );
}

export async function collectAdIntelligence(
  data: CollectionEvent,
): Promise<State & { jobId: string }> {
  const job = await getCollectionJob(data.jobId);

  if (!job) {
    throw new Error(`Collection job ${data.jobId} was not found.`);
  }

  const phase: Phase =
    data.platform === "meta" && data.collectionDepth === "deep"
      ? "deep"
      : data.platform === "meta"
        ? "quick"
        : "deep";

  if (!data.runId || !data.requestId) {
    throw new Error(
      "Durable AdSpy execution requires both runId and requestId.",
    );
  }

  const claimed = await claimAdSpyRequest({
    requestId: data.requestId,
    workerId: `adspy:${process.pid}:${crypto.randomUUID()}`,
    leaseSeconds: 300,
  });

  if (!claimed) {
    const latest = await getCollectionJob(data.jobId);

    return {
      jobId: data.jobId,
      discoveredAds: latest?.discoveredAds ?? 0,
      normalizedAds: latest?.normalizedAds ?? 0,
      persistedAds: latest?.persistedAds ?? 0,
    };
  }

  const state: State = {
    discoveredAds: Number(job.discoveredAds ?? 0),
    normalizedAds: Number(job.normalizedAds ?? 0),
    persistedAds: Number(job.persistedAds ?? 0),
  };

  const seenIds = new Set<string>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const persist = async (
    incoming: CompetitorAd[],
  ): Promise<void> => {
    const ads = uniqueBatch(incoming, seenIds);
    if (!ads.length) return;

    state.discoveredAds += ads.length;

    for (
      let offset = 0;
      offset < ads.length;
      offset += CHUNK_SIZE
    ) {
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

      await updateCollectionJob(data.jobId, {
        status:
          phase === "quick"
            ? "scraping"
            : "deep",
        stage:
          phase === "quick"
            ? "scraping"
            : "deep",
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
      });

      await updateAdSpyRunCounts({
        runId: data.runId!,
        discoveredAds: state.discoveredAds,
        normalizedAds: state.normalizedAds,
        persistedAds: state.persistedAds,
        stage:
          phase === "quick"
            ? "meta_quick"
            : "meta_deep",
        status: "running",
      });
    }
  };

  try {
    await updateCollectionJob(data.jobId, {
      status:
        phase === "quick"
          ? "scraping"
          : "deep",
      stage:
        phase === "quick"
          ? "scraping"
          : "deep",
      startedAt:
        job.startedAt ??
        new Date().toISOString(),
      errorMessage: null,
      discoveredAds: state.discoveredAds,
      normalizedAds: state.normalizedAds,
      persistedAds: state.persistedAds,
    });

    await heartbeatAdSpyRun(
      data.runId,
      data.requestId,
    );

    heartbeatTimer = setInterval(() => {
      void heartbeatAdSpyRun(
        data.runId!,
        data.requestId!,
      ).catch((error) => {
        console.error(
          "[ADSPY_DURABLE_HEARTBEAT_FAILED]",
          error,
        );
      });
    }, HEARTBEAT_MS);

    if (!adProviders[data.platform]) {
      throw new Error(
        `No provider configured for ${data.platform}.`,
      );
    }

    if (data.platform === "meta") {
      const {
        collectMetaAdsInBatches,
      } = await import(
        "@/lib/ad-intelligence/providers/deep-meta"
      );

      await collectMetaAdsInBatches(
        {
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId:
            data.advertiserPageId ?? null,
        },
        async (batch) => {
          await persist(batch);
        },
      );
    } else {
      const result =
        await adProviders[
          data.platform
        ]!.search({
          query: data.query,
          country: data.country,
          platform: data.platform,
          mode: data.mode,
          collectionDepth: phase,
          advertiserPageId:
            data.advertiserPageId ?? null,
        });

      await persist(
        result.ads ?? [],
      );
    }

    if (
      phase === "quick" &&
      data.platform === "meta"
    ) {
      await completeAdSpyRequest({
        requestId: data.requestId,
        result: {
          phase: "quick",
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
        },
      });

      await updateCollectionJob(
        data.jobId,
        {
          status: "deep_queued",
          stage: "deep_queued",
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
        },
      );

      await updateAdSpyRunCounts({
        runId: data.runId,
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
        stage: "deep_queued",
        status: "running",
      });

      await dispatchDeep(
        data,
        data.runId,
      );

      return {
        jobId: data.jobId,
        ...state,
      };
    }

    await completeAdSpyRequest({
      requestId: data.requestId,
      result: {
        phase,
        discoveredAds:
          state.discoveredAds,
        normalizedAds:
          state.normalizedAds,
        persistedAds:
          state.persistedAds,
      },
    });

    await finishAdSpyRun({
      runId: data.runId,
      status: "exhausted",
      errorMessage: null,
    });

    await updateCollectionJob(
      data.jobId,
      {
        status: "exhausted",
        stage: "exhausted",
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

    await markTrackedBrandCollected({
      query: data.query,
      country: data.country,
      platform: data.platform,
    });

    return {
      jobId: data.jobId,
      ...state,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Collection failed.";

    let requestState:
      | Awaited<
          ReturnType<
            typeof failAdSpyRequest
          >
        >
      | null = null;

    try {
      requestState =
        await failAdSpyRequest({
          requestId: data.requestId,
          errorMessage: message,
          retryable: true,
        });
    } catch (requestError) {
      console.error(
        "[ADSPY_REQUEST_FAILURE_TRANSITION]",
        requestError,
      );
    }

    try {
      if (
        requestState?.status === "retrying"
      ) {
        await updateAdSpyRunCounts({
          runId: data.runId,
          discoveredAds:
            state.discoveredAds,
          normalizedAds:
            state.normalizedAds,
          persistedAds:
            state.persistedAds,
          stage: "retrying",
          status: "retrying",
        });

        await updateCollectionJob(
          data.jobId,
          {
            status: "queued",
            stage: "queued",
            errorMessage: message,
            discoveredAds:
              state.discoveredAds,
            normalizedAds:
              state.normalizedAds,
            persistedAds:
              state.persistedAds,
          },
        );
      } else {
        await finishAdSpyRun({
          runId: data.runId,
          status: "failed",
          errorMessage: message,
        });

        await updateCollectionJob(
          data.jobId,
          {
            status: "failed",
            stage: "failed",
            errorMessage: message,
            discoveredAds:
              state.discoveredAds,
            normalizedAds:
              state.normalizedAds,
            persistedAds:
              state.persistedAds,
            completedAt:
              new Date().toISOString(),
          },
        );
      }
    } catch (stateError) {
      console.error(
        "[ADSPY_RUN_STATE_UPDATE_FAILED]",
        stateError,
      );
    }

    throw error;
  } finally {
    if (heartbeatTimer) {
      clearInterval(
        heartbeatTimer,
      );
    }
  }
}