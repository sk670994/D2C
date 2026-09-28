import "server-only";

import { after } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { reapExpiredAdSpyRequests } from "@/lib/ad-intelligence/durable-run";
import { pickRunnable, type Candidate } from "@/worker/worker-core";

import { collectAdIntelligence, type CollectionEvent } from "./collect-ad-intelligence";
import { recoverStaleRuns } from "./start-collection";

/**
 * Serverless collector: the Vercel replacement for the PC worker's loop.
 *
 * Takes queued adspy_requests (same table, same atomic claim, same state
 * machine as the worker) and runs them with the SearchApi source until the
 * time budget is spent. When idle, spends leftover time on AI decoding.
 * Called by /api/adspy/drain: kicked right after a user queues a brand, by
 * the nightly cron, and by the GitHub health workflow as a safety net.
 */

export type DrainResult = {
  processed: number;
  failed: number;
  remaining: boolean;
  reaped: number;
  decoded: number;
  landingPages?: number;
  ms: number;
};

async function candidates(): Promise<Candidate[]> {
  const { data, error } = await createGlobalServiceClient()
    .from("adspy_requests")
    .select("id,run_id,payload,attempt,max_attempts,priority,available_at,created_at,status")
    .in("status", ["queued", "retrying"])
    .lte("available_at", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Failed to list AdSpy requests: ${error.message}`);
  return (data ?? []) as Candidate[];
}

/** Minimum time left to start another brand (one SearchApi page + saving). */
const MIN_START_MS = 45_000;

export async function drainAdSpyQueue(input: { deadlineAt: number; maxJobs?: number; decode?: boolean }): Promise<DrainResult> {
  const started = Date.now();
  const result: DrainResult = { processed: 0, failed: 0, remaining: false, reaped: 0, decoded: 0, ms: 0 };

  try {
    result.reaped = (await reapExpiredAdSpyRequests()) + (await recoverStaleRuns());
  } catch (error) {
    console.warn("[AdSpy drain] reaper skipped", error instanceof Error ? error.message : error);
  }

  const tried = new Set<string>();
  const maxJobs = input.maxJobs ?? 25;
  while (result.processed + result.failed < maxJobs) {
    if (input.deadlineAt - Date.now() < MIN_START_MS) {
      result.remaining = true;
      break;
    }
    const next = pickRunnable((await candidates()).filter((c) => !tried.has(c.id)));
    if (!next) break;
    tried.add(next.id);

    const payload = (next.payload ?? {}) as Partial<CollectionEvent>;
    if (!payload.jobId || !payload.runId) continue;
    try {
      await collectAdIntelligence({ ...(payload as CollectionEvent), runId: payload.runId, requestId: next.id }, { deadlineAt: input.deadlineAt - 10_000 });
      result.processed += 1;
    } catch (error) {
      // The job already recorded the failure / retry on the request row.
      result.failed += 1;
      console.error("[AdSpy drain] collection failed", { requestId: next.id, error: error instanceof Error ? error.message : error });
    }
  }

  // Idle time -> AI labels, so no PC is needed for decoding either.
  if (input.decode !== false && !result.remaining && process.env.GEMINI_API_KEY && process.env.ADSPY_DECODE !== "0") {
    const left = input.deadlineAt - Date.now() - 5_000;
    if (left > 20_000) {
      try {
        const { decodePendingAds } = await import("@/lib/decode/run");
        const decoded = await decodePendingAds({ limit: 15, deadlineAt: Date.now() + Math.min(left, 90_000) });
        result.decoded = Number(decoded.decoded ?? 0);
      } catch (error) {
        console.warn("[AdSpy drain] decode skipped", error instanceof Error ? error.message : error);
      }
    }
  }

  // Then landing pages of watched brands (Jina Reader), with what is left.
  if (input.decode !== false && !result.remaining) {
    const left = input.deadlineAt - Date.now() - 5_000;
    if (left > 30_000) {
      try {
        const { checkLandingPages } = await import("@/lib/landing/check");
        const landing = await checkLandingPages({ limit: 8, deadlineAt: Date.now() + Math.min(left, 90_000) });
        result.landingPages = landing.pages;
      } catch (error) {
        console.warn("[AdSpy drain] landing check skipped", error instanceof Error ? error.message : error);
      }
    }
  }

  result.ms = Date.now() - started;
  return result;
}

/** Absolute URL of the drain route on this deployment's production domain. */
export function drainUrl(): string | null {
  const explicit = process.env.ADSPY_DRAIN_URL?.trim();
  if (explicit) return explicit;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "").trim();
  return host ? `https://${host.replace(/\/+$/, "")}/api/adspy/drain` : null;
}

/** Wake the drain route and wait only until it has accepted (it answers 202 at once). */
export async function pingAdSpyDrain(): Promise<void> {
  const url = drainUrl();
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) {
    console.warn("[AdSpy drain] not kicked: set CRON_SECRET and ADSPY_DRAIN_URL (or VERCEL_PROJECT_PRODUCTION_URL)");
    return;
  }
  // Follow one redirect by hand (apex -> www): fetch drops Authorization on
  // cross-origin redirects, which would turn the kick into a silent 401.
  const post = (target: string) =>
    fetch(target, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, redirect: "manual", signal: AbortSignal.timeout(8_000) });
  try {
    const first = await post(url);
    const location = first.status >= 300 && first.status < 400 ? first.headers.get("location") : null;
    const final = location ? await post(new URL(location, url).toString()) : first;
    if (final.status === 401) console.error("[AdSpy drain] kick rejected: CRON_SECRET mismatch");
  } catch {
    // Covered by the GitHub workflow (every 30 min) and the nightly cron.
  }
}

let lastKickAt = 0;
/** One kick per instance per this window: a cron queueing 50 brands wakes one drain, not 50. */
const KICK_WINDOW_MS = 20_000;

/** Fire-and-forget kick from inside a request (runs after the response). */
export function kickAdSpyDrain(): void {
  if (Date.now() - lastKickAt < KICK_WINDOW_MS) return;
  lastKickAt = Date.now();
  try {
    after(pingAdSpyDrain);
  } catch {
    void pingAdSpyDrain(); // outside a request (scripts): best effort
  }
}
