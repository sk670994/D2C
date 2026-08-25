import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getCollectionJob } from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const auth = await createServerAuthClient();
    const {
      data: { user },
      error: userError,
    } = await auth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message: "You must be signed in to check collection status.",
        },
        { status: 401 },
      );
    }

    const { jobId } = await context.params;
    const normalizedJobId = jobId?.trim();
    if (!normalizedJobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId." },
        { status: 400 },
      );
    }

    const job = await getCollectionJob(normalizedJobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Collection job not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        collectionKey: job.collectionKey,
        query: job.query,
        country: job.country,
        platform: job.platform,
        mode: job.mode,
        status: job.status,
        stage: job.stage,
        discoveredAds: job.discoveredAds,
        normalizedAds: job.normalizedAds,
        persistedAds: job.persistedAds,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        lastRequestedAt: job.lastRequestedAt,
        updatedAt: job.updatedAt,
        createdAt: job.createdAt,
      },
    });
  } catch (error) {
    console.error("[AdIntelligenceSearchStatus] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to read collection job status.",
      },
      { status: 500 },
    );
  }
}
