import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  getCompetitiveAnalytics,
} from "@/lib/ad-intelligence/global/analytics";

import type {
  AdPlatform,
} from "@/lib/ad-intelligence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  try {
    const auth =
      await createServerAuthClient();

    const {
      data: { user },
      error: authError,
    } =
      await auth.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const params =
      request.nextUrl.searchParams;

    const query =
      (
        params.get("q") ??
        ""
      ).trim();

    const platform =
      params.get("platform") ===
        "google"
        ? "google"
        : params.get("platform") ===
            "linkedin"
          ? "linkedin"
          : "meta";

    const mode =
      params.get("mode") ===
        "keyword"
        ? "keyword"
        : "advertiser";

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        analysis: null,
      });
    }

    const analysis =
      await getCompetitiveAnalytics({
        query,
        platform:
          platform as AdPlatform,
        mode,
      });

    return NextResponse.json({
      success: true,
      query,
      platform,
      mode,
      analysis,
    });
  } catch (error) {
    console.error(
      "[AdSpy analysis]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Competitive analysis failed.",
      },
      { status: 500 },
    );
  }
}