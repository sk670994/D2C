import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  autocompleteBrands,
} from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();

    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          suggestions: [],
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const q = (
      request.nextUrl.searchParams.get("q") ?? ""
    ).trim();

    if (q.length < 2) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const mode =
      request.nextUrl.searchParams.get("mode") ===
      "keyword"
        ? "keyword"
        : "advertiser";

    const suggestions =
      await autocompleteBrands({
        query: q,
        mode,
        limit: 8,
      });

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error(
      "[AdSpy autocomplete]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        suggestions: [],
        error:
          error instanceof Error
            ? error.message
            : "Autocomplete unavailable",
      },
      { status: 503 },
    );
  }
}