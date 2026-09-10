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
        error:
          error instanceof Error
            ? error.message
            : "Tracked AdSpy refresh failed.",
      },
      { status: 500 },
    );
  }
}
