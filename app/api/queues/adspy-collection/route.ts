import { handleCallback } from "@vercel/queue";
import { collectAdIntelligence } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";
import type { CollectionEvent } from "@/lib/ad-intelligence/jobs/collect-ad-intelligence";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handleCallback(async (message: CollectionEvent, metadata) => {
  console.info("[AdSpy Queue] Processing collection", {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    topic: metadata.topicName,
    jobId: message.jobId,
    phase: message.collectionDepth ?? "deep",
  });
  await collectAdIntelligence(message);
});
