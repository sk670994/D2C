import "server-only";

import { send } from "@vercel/queue";

import {
  buildCollectionKey,
  claimCollectionDispatch,
  getCollectionJob,
  getOrCreateCollectionJob,
  listTrackedBrands,
} from "@/lib/ad-intelligence/global/store";

export async function refreshTrackedAdSpy(): Promise<{
  trackedBrands: number;
  dispatched: number;
}> {
  const brands =
    await listTrackedBrands();

  const now = Date.now();

  let dispatched = 0;

  for (const brand of brands) {
    const refreshHours =
      Math.max(
        1,
        Number(
          brand.refreshHours ?? 24,
        ),
      );

    const lastCollectedAt =
      brand.lastCollectedAt ?? null;

    const lastCollectedMs =
      lastCollectedAt
        ? new Date(
            lastCollectedAt,
          ).getTime()
        : null;

    const shouldRefresh =
      lastCollectedMs === null ||
      !Number.isFinite(
        lastCollectedMs,
      ) ||
      now -
          lastCollectedMs >=
        refreshHours *
          60 *
          60 *
          1000;

    if (!shouldRefresh) {
      continue;
    }

    const job =
      await getOrCreateCollectionJob({
        query: brand.query,
        country: brand.country,
        platform: brand.platform,
        mode: "advertiser",
      });

    const claimed =
      await claimCollectionDispatch(
        job.id,
      );

    if (!claimed) {
      continue;
    }

    const latest =
      await getCollectionJob(
        job.id,
      );

    if (!latest) {
      throw new Error(
        "Tracked collection job disappeared before dispatch.",
      );
    }

    const collectionKey =
      buildCollectionKey({
        query: latest.query,
        country: latest.country,
        platform: latest.platform,
        mode: latest.mode,
      });

    /*
     * Queue messages are intentionally idempotent inside a
     * short dispatch window. This prevents duplicate queue
     * submissions while still allowing legitimate later
     * refreshes.
     */
    const dispatchBucket =
      Math.floor(
        Date.now() / 600_000,
      );

    await send(
      "adspy-collection",
      {
        jobId: latest.id,
        query: latest.query,
        country: latest.country,
        platform: latest.platform,
        mode: latest.mode,
        collectionKey,
        collectionDepth:
          latest.platform === "meta"
            ? "quick"
            : "deep",
      },
      {
        idempotencyKey:
          `${collectionKey}:dispatch:${dispatchBucket}`,

        retentionSeconds:
          24 * 60 * 60,
      },
    );

    dispatched += 1;
  }

  return {
    trackedBrands:
      brands.length,

    dispatched,
  };
}