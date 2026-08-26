import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  autocompleteBrands,
} from "@/lib/ad-intelligence/global/store";

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
          error:
            "Unauthorized",
        },
        { status: 401 },
      );
    }

    const query =
      (
        request.nextUrl.searchParams.get(
          "q",
        ) ?? ""
      ).trim();

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const mode = request.nextUrl.searchParams.get("mode") === "keyword" ? "keyword" : "advertiser";

    const suggestions =
      await autocompleteBrands({
        query,
        limit: 8,
        mode,
      });

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error(
      "[AdIntelligenceAutocomplete] Failed:",
      error,
    );

    return NextResponse.json(
      {
        success: true,
        suggestions: [],
        warning:
          "Autocomplete temporarily unavailable.",
      },
      { status: 200 },
    );
  }
}


