import { handleCallback } from "@vercel/queue";

import {
  abandonCollection,
  collectAdIntelligence,
  NonRetryableCollectionError,
} from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";

import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A logical collection gets a bounded number of deliveries.
 * Prevents a permanently failing message from being retried forever.
 */
const MAX_DELIVERIES =
  Number(process.env.ADSPY_QUEUE_MAX_DELIVERIES) || 4;

const queueHandler = handleCallback<CollectionEvent>(
  async (message, metadata) => {
    const context = {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      topic: metadata.topicName,
      jobId: message.jobId,
      runId: message.runId ?? null,
      requestId: message.requestId ?? null,
      phase: message.collectionDepth ?? "deep",
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    };

    console.info(
      "[AdSpy Queue] Durable collection request",
      context,
    );

    if (Number(metadata.deliveryCount) > MAX_DELIVERIES) {
      const reason = `Collection gave up after ${metadata.deliveryCount} deliveries.`;

      console.warn(
        "[AdSpy Queue] delivery limit reached; acknowledging",
        context,
      );

      await abandonCollection(message, reason);
      return;
    }

    const startedAt = Date.now();

    try {
      await collectAdIntelligence(message);

      console.info("[AdSpy Queue] completed", {
        ...context,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : String(error);

      if (error instanceof NonRetryableCollectionError) {
        console.warn("[AdSpy Queue] non-retryable; acknowledging", {
          ...context,
          reason,
          ms: Date.now() - startedAt,
        });

        return;
      }

      console.error("[AdSpy Queue] failed; will be redelivered", {
        ...context,
        reason,
        ms: Date.now() - startedAt,
      });

      throw error;
    }
  },
);

/**
 * Next.js App Router requires the exported route handler to have
 * a standard Request-compatible signature.
 *
 * @vercel/queue internally also accepts `{ request: Request }`,
 * so we adapt it here rather than exporting handleCallback directly.
 */
export async function POST(request: Request): Promise<Response> {
  return queueHandler(request);
}