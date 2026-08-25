import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getCollectionJob } from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    // 1. Authenticate the user.
    const authClient = await createServerAuthClient();

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

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

    // 2. Read the dynamic [jobId] route parameter.
    const { jobId } = await context.params;

    if (!jobId?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing jobId.",
        },
        { status: 400 },
      );
    }

    // 3. Load the collection job.
    const job = await getCollectionJob(jobId.trim());

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: "Collection job not found.",
        },
        { status: 404 },
      );
    }

    // 4. Return the current job state.
    return NextResponse.json(
      {
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
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "[AdIntelligenceSearchStatus] Failed to read collection job:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to read collection job status.",
      },
      { status: 500 },
    );
  }
}