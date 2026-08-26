import "server-only";

import { inngest } from "@/inngest/client";

import {
  getOrCreateCollectionJob,
  listTrackedBrands,
  claimCollectionDispatch,
  getCollectionJob,
  buildCollectionKey,
} from "@/lib/ad-intelligence/global/store";

export const refreshTrackedAdSpy =
  inngest.createFunction(
    {
      id: "zooptrack-refresh-tracked-adspy",
      retries: 1,
      triggers: [
        {
          cron: "0 */6 * * *",
        },
      ],
    },

    async ({ step }) => {
      const brands = await step.run(
        "load-tracked-brands",
        async () => listTrackedBrands(),
      );

      const now = Date.now();

      let dispatched = 0;

      for (const brand of brands) {
        const refreshHours = Math.max(
          1,
          Number(brand.refreshHours ?? 24),
        );

        const lastCollectedAt =
          brand.lastCollectedAt ?? null;

        const lastCollectedMs =
          lastCollectedAt
            ? new Date(lastCollectedAt).getTime()
            : null;

        const shouldRefresh =
          lastCollectedMs === null ||
          !Number.isFinite(lastCollectedMs) ||
          now - lastCollectedMs >=
            refreshHours *
              60 *
              60 *
              1000;

        if (!shouldRefresh) {
          continue;
        }

        const job = await step.run(
          `ensure-job-${brand.id}`,
          async () =>
            getOrCreateCollectionJob({
              query: brand.query,
              country: brand.country,
              platform: brand.platform,
              mode: "advertiser",
            }),
        );

        const claimed = await step.run(
          `claim-${brand.id}`,
          async () =>
            claimCollectionDispatch(job.id),
        );

        if (!claimed) {
          continue;
        }

        await step.run(
          `dispatch-${brand.id}`,
          async () => {
            const latest =
              await getCollectionJob(job.id);

            if (!latest) {
              throw new Error(
                "Tracked-brand collection job disappeared before dispatch.",
              );
            }

            await inngest.send({
              name:
                "zooptrack/ad-intelligence.collection.requested",

              data: {
                jobId: latest.id,
                query: latest.query,
                country: latest.country,
                platform: latest.platform,
                mode: latest.mode,

                collectionKey:
                  buildCollectionKey({
                    query: latest.query,
                    country: latest.country,
                    platform: latest.platform,
                    mode: latest.mode,
                  }),
              },
            });
          },
        );

        dispatched += 1;
      }

      return {
        trackedBrands: brands.length,
        dispatched,
      };
    },
  );