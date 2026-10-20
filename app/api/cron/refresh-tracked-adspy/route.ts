import { NextRequest } from "next/server";

import {
  refreshTrackedAdSpy,
} from "@/lib/ad-intelligence/jobs/refresh-tracked-ad-spy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ADSPY_NIGHTLY_ON_PC=1: the PC collects tracked brands in full each night
  // for free (and reaps stuck runs itself), so this cron does nothing at all:
  // no API credits and no database reads on the nano instance.
  if (process.env.ADSPY_NIGHTLY_ON_PC === "1") {
    return Response.json({ success: true, skipped: "nightly_on_pc" });
  }

  try {
    const result = await refreshTrackedAdSpy();

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "[Tracked AdSpy Refresh] Failed:",
      error,
    );

    return Response.json(
      {
        success: false,
        error: "Tracked AdSpy refresh failed.",
      },
      { status: 500 },
    );
  }
}
