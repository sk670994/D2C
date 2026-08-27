import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  createGlobalServiceClient,
} from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  },
) {
  try {
    const auth =
      await createServerAuthClient();

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await auth.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          message:
            "You must be signed in to check collection status.",
        },
        {
          status: 401,
        },
      );
    }

    const {
      jobId,
    } =
      await context.params;

    const normalizedJobId =
      jobId?.trim();

    if (
      !normalizedJobId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing jobId.",
        },
        {
          status: 400,
        },
      );
    }

    const client =
      createGlobalServiceClient();

    const {
      data,
      error,
    } =
      await client.rpc(
        "adspy_get_collection_job",
        {
          p_job_id:
            normalizedJobId,
        },
      );

    if (error) {
      console.error(
        "[AdSpy Status] RPC failed:",
        error,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Collection status lookup failed.",
          message:
            error.message,
          retryable: true,
        },
        {
          status: 500,
        },
      );
    }

    const row =
      Array.isArray(data)
        ? data[0] ?? null
        : data ?? null;

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Collection job not found.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      success: true,

      job: {
        id: row.id,

        collectionKey:
          row.collection_key,

        query:
          row.query,

        country:
          row.country,

        platform:
          row.platform,

        mode:
          row.mode,

        status:
          row.status,

        stage:
          row.stage,

        discoveredAds:
          Number(
            row.discovered_ads ??
              0,
          ),

        normalizedAds:
          Number(
            row.normalized_ads ??
              0,
          ),

        persistedAds:
          Number(
            row.persisted_ads ??
              0,
          ),

        errorMessage:
          row.error_message ??
          null,

        startedAt:
          row.started_at ??
          null,

        completedAt:
          row.completed_at ??
          null,

        lastRequestedAt:
          row.last_requested_at ??
          null,

        updatedAt:
          row.updated_at ??
          null,

        createdAt:
          row.created_at ??
          null,
      },
    });
  } catch (error) {
    console.error(
      "[AdSpy Status] Unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load collection status.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown error",
        retryable: true,
      },
      {
        status: 500,
      },
    );
  }
}