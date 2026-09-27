import { NextRequest } from "next/server";

import { decodePendingAds } from "@/lib/decode/run";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily top-up of AI ad labels (the worker also labels ads while idle). */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await decodePendingAds({ limit: 25, deadlineAt: Date.now() + 50_000 });
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("[decode-ads]", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Decode failed." }, { status: 500 });
  }
}
