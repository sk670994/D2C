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

  try {
    // ADSPY_NIGHTLY_ON_PC=1: the PC collects tracked brands in full each
    // night for free, so this cron must not spend ScrapeCreators credits.
    const result = await refreshTrackedAdSpy({ skipDispatch: process.env.ADSPY_NIGHTLY_ON_PC === "1" });

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
        error:
          error instanceof Error
            ? error.message
            : "Tracked AdSpy refresh failed.",
      },
      { status: 500 },
    );
  }
}
