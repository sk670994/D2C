import { after, NextRequest } from "next/server";

import { drainAdSpyQueue, pingAdSpyDrain } from "@/lib/ad-intelligence/jobs/drain";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
// Short invocations, chained: each drain works ~3 minutes at most and hands
// over to a fresh one, far from Vercel's 300 s ceiling (tail latency of the
// provider or the database can no longer push a run into a timeout).
export const maxDuration = 300;

const BUDGET_MS = Math.min(Number(process.env.DRAIN_BUDGET_MS) || 180_000, 200_000);

async function run() {
  const result = await drainAdSpyQueue({ deadlineAt: Date.now() + BUDGET_MS });
  console.info("[AdSpy drain]", result);
  // More work than one invocation could finish: hand over to a fresh one.
  if (result.remaining) await pingAdSpyDrain();
  return result;
}

/**
 * Runs queued AdSpy collections on Vercel (SearchApi source). Protected by
 * CRON_SECRET. Answers at once and keeps working after the response (so a
 * caller never holds a connection open); ?wait=1 waits and returns the result.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (process.env.ADSPY_COLLECTOR !== "searchapi") {
    return Response.json({ success: true, skipped: "ADSPY_COLLECTOR is not searchapi (the PC/VPS worker collects)" });
  }
  if (request.nextUrl.searchParams.get("wait") === "1") {
    try {
      return Response.json({ success: true, ...(await run()) });
    } catch (error) {
      console.error("[AdSpy drain]", error);
      return Response.json({ success: false, error: error instanceof Error ? error.message : "Drain failed." }, { status: 500 });
    }
  }
  after(() => run().catch((error) => console.error("[AdSpy drain]", error)));
  return Response.json({ success: true, accepted: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
