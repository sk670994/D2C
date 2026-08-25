import { inngest } from "./client";
import { adProviders } from "@/lib/ad-intelligence/providers";
import { enrichAds, buildAdSearchSummary } from "@/lib/ad-intelligence/intelligence";
import { ingestGlobalAds } from "@/lib/ad-intelligence/global/ingest";
import { claimCollectionDispatch, getCollectionJob, listTrackedBrands, updateCollectionJob, getOrCreateCollectionJob } from "@/lib/ad-intelligence/global/store";
import type { AdPlatform } from "@/lib/ad-intelligence/types";

export const collectAdIntelligence = inngest.createFunction(
  {
    id: "collect-ad-intelligence",
    concurrency: [
      { limit: 1, key: "event.data.collectionKey" },
{ limit: 3, key: "event.data.platform" },
    ],
    triggers: { event: "ad-intelligence/collection.requested" },
  },
  async ({ event, step }) => {
    const { jobId, query, country, platform, mode } = event.data as { jobId: string; collectionKey: string; query: string; country: string; platform: AdPlatform; mode: "advertiser" | "keyword" };
    const job = await getCollectionJob(jobId);
    if (!job) throw new Error(`Collection job ${jobId} not found.`);

    await step.run("mark-scraping", async () => {
      await updateCollectionJob(jobId, { status: "scraping", stage: "scraping", startedAt: new Date().toISOString(), errorMessage: null });
    });

    try {
      const providerAds = await step.run("collect-provider-data", async () => {
        const provider = adProviders[platform];
        if (!provider) throw new Error(`${platform} provider is not available.`);
        const result = await provider.search({ query, country, platform, mode });
        if (!result.ads.length) throw new Error(`Provider returned no usable ads for ${query}.`);
        await updateCollectionJob(jobId, { discoveredAds: result.ads.length, stage: "normalizing", status: "normalizing" });
        return result.ads;
      });

      const enriched = await step.run("enrich-data", async () => {
        await updateCollectionJob(jobId, { stage: "enriching", status: "enriching", normalizedAds: providerAds.length });
        return enrichAds(providerAds, query);
      });

      const summary = await step.run("build-intelligence", async () => {
        await updateCollectionJob(jobId, { stage: "finalizing", status: "finalizing" });
        return buildAdSearchSummary(enriched);
      });

      const persisted = await step.run("persist-global-intelligence", async () => {
        const result = await ingestGlobalAds(enriched);
        await updateCollectionJob(jobId, { stage: "complete", status: "complete", persistedAds: result.insertedOrUpdated, normalizedAds: enriched.length, completedAt: new Date().toISOString() });
        return result;
      });

      return { jobId, query, country, platform, ads: enriched.length, summary, persisted };
    } catch (error) {
      await updateCollectionJob(jobId, { stage: "failed", status: "failed", errorMessage: error instanceof Error ? error.message : "Unknown collection error" });
      throw error;
    }
  },
);

export const refreshTrackedBrands = inngest.createFunction(
  {
    id: "refresh-tracked-brands",
    triggers: [{ cron: "0 */6 * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const brands = await step.run("load-tracked-brands", () => listTrackedBrands());
    const results: Array<{ jobId: string; query: string }> = [];
    for (const brand of brands) {
      const job = await getOrCreateCollectionJob({ query: brand.query, country: brand.country, platform: brand.platform, mode: "advertiser" });
      const shouldDispatch = await claimCollectionDispatch(job.id);
      if (!shouldDispatch) continue;
      await inngest.send({
        name: "ad-intelligence/collection.requested",
        data: { jobId: job.id, collectionKey: job.collectionKey, query: job.query, country: job.country, platform: brand.platform, mode: "advertiser" },
      });
      results.push({ jobId: job.id, query: brand.query });
    }
    return { tracked: brands.length, requested: results.length, results };
  },
);
