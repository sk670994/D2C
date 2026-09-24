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
 * A logical collection gets a bounded number of deliveries. Before this guard
 * a failing message was redelivered for its whole 24h retention (observed:
 * deliveryCount 43 on a 5-hour-old deployment).
 */
const MAX_DELIVERIES = Number(process.env.ADSPY_QUEUE_MAX_DELIVERIES) || 4;

export const POST = handleCallback(async (message: CollectionEvent, metadata) => {
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
  console.info("[AdSpy Queue] Durable collection request", context);

  if (Number(metadata.deliveryCount) > MAX_DELIVERIES) {
    const reason = `Collection gave up after ${metadata.deliveryCount} deliveries.`;
    console.warn("[AdSpy Queue] delivery limit reached; acknowledging", context);
    await abandonCollection(message, reason);
    return; // ack: never loop forever
  }

  const startedAt = Date.now();
  try {
    await collectAdIntelligence(message);
    console.info("[AdSpy Queue] completed", { ...context, ms: Date.now() - startedAt });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof NonRetryableCollectionError) {
      console.warn("[AdSpy Queue] non-retryable; acknowledging", { ...context, reason, ms: Date.now() - startedAt });
      return; // ack
    }
    console.error("[AdSpy Queue] failed; will be redelivered", { ...context, reason, ms: Date.now() - startedAt });
    throw error;
  }
});
