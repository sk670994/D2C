import "server-only";

import { send } from "@vercel/queue";

import type { CollectionEvent } from "./collect-ad-intelligence";
import { collectAdIntelligence } from "./collect-ad-intelligence";

export type AdSpyDispatchMode = "queue" | "inline";

export function getAdSpyDispatchMode(): AdSpyDispatchMode {
  return process.env.VERCEL ? "queue" : "inline";
}

export async function dispatchAdSpyCollection(
  payload: CollectionEvent,
  idempotencyKey: string,
): Promise<{
  mode: AdSpyDispatchMode;
}> {
  const mode = getAdSpyDispatchMode();

  if (mode === "queue") {
    await send("adspy-collection", payload, {
      idempotencyKey,
      retentionSeconds: 24 * 60 * 60,
    });

    return {
      mode,
    };
  }

  /*
   * Local development:
   *
   * Do not require Vercel Queue/OIDC.
   * Run the exact same collector implementation inline.
   *
   * This is intentionally fire-and-forget so the refresh endpoint
   * remains responsive.
   */
  void collectAdIntelligence(payload).catch((error) => {
    console.error("[AdSpy Dispatch] Inline collection failed:", {
      jobId: payload.jobId,
      query: payload.query,
      platform: payload.platform,
      mode: payload.mode,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
  });

  return {
    mode,
  };
}