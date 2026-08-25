import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { autocompleteBrands } from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    console.log("[Autocomplete] START");

    const authStartedAt = Date.now();

    const auth = await createServerAuthClient();

    const {
      data: { user },
    } = await auth.auth.getUser();

    console.log("[Autocomplete] AUTH", {
      durationMs: Date.now() - authStartedAt,
      authenticated: Boolean(user),
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const q = (
      request.nextUrl.searchParams.get("q") ?? ""
    ).trim();

    console.log("[Autocomplete] QUERY", q);

    if (q.length < 2) {
      return NextResponse.json({
        success: true,
        suggestions: [],
      });
    }

    const lookupStartedAt = Date.now();

    const suggestions = await autocompleteBrands({
      query: q,
      limit: 8,
    });

    console.log("[Autocomplete] LOOKUP", {
      query: q,
      durationMs: Date.now() - lookupStartedAt,
      suggestions: suggestions.length,
    });

    console.log("[Autocomplete] TOTAL", {
      query: q,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("[Autocomplete] ERROR", error);

    return NextResponse.json({
      success: true,
      suggestions: [],
      warning:
        error instanceof Error
          ? error.message
          : "Autocomplete unavailable",
    });
  }
}