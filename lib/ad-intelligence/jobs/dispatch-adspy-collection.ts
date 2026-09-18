import "server-only";

import { send } from "@vercel/queue";
import type { CollectionEvent } from "./collect-ad-intelligence";

export type AdSpyDispatchMode = "queue" | "inline";

export function getAdSpyDispatchMode(): AdSpyDispatchMode {
  return process.env.VERCEL ? "queue" : "inline";
}

export async function dispatchAdSpyCollection(
  payload: CollectionEvent,
  idempotencyKey: string,
): Promise<{ mode: AdSpyDispatchMode }> {
  const mode = getAdSpyDispatchMode();

  if (mode === "queue") {
    await send(
      "adspy-collection",
      payload,
      {
        idempotencyKey,
        retentionSeconds: 24 * 60 * 60,
      },
    );

    return { mode };
  }

  // Local development only. The heavy worker is loaded dynamically so
  // API routes do not statically inherit Playwright/Chromium.
  setTimeout(() => {
    void import("./collect-ad-intelligence")
      .then(({ collectAdIntelligence }) => collectAdIntelligence(payload))
      .catch((error) => {
        console.error(
          "[AdSpy Dispatch] Inline collection failed",
          {
            jobId: payload.jobId,
            phase: payload.collectionDepth,
            error:
              error instanceof Error
                ? error.message
                : error,
          },
        );
      });
  }, 0);

  return { mode };
}
