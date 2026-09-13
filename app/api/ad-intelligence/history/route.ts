import { NextRequest, NextResponse } from "next/server";

import {
  createClient as createServerAuthClient,
} from "@/lib/supabase/server";

import {
  createGlobalServiceClient,
} from "@/lib/ad-intelligence/global/supabase";

import type {
  AdPlatform,
} from "@/lib/ad-intelligence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePlatform(
  value: string | null,
): AdPlatform {
  if (value === "google") {
    return "google";
  }

  if (value === "linkedin") {
    return "linkedin";
  }

  return "meta";
}

function normalizeMode(
  value: string | null,
) {
  return value === "keyword"
    ? "keyword"
    : "advertiser";
}

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

    if (authError || !user) {
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
        params.get("q") ?? ""
      ).trim();

    const country =
      (
        params.get("country") ?? "IN"
      )
        .trim()
        .toUpperCase();

    const platform =
      normalizePlatform(
        params.get("platform"),
      );

    const mode =
      normalizeMode(
        params.get("mode"),
      );

    const rawLimit =
      Number(
        params.get("limit") ?? "300",
      );

    const limit =
      Number.isFinite(rawLimit)
        ? Math.min(
            3000,
            Math.max(
              1,
              Math.floor(rawLimit),
            ),
          )
        : 300;

    if (
      query.length < 2 ||
      !/^[A-Z]{2}$/.test(country)
    ) {
      return NextResponse.json({
        success: true,
        query,
        country,
        platform,
        mode,
        versions: [],
      });
    }

    const client =
      createGlobalServiceClient();

    const {
      data,
      error,
    } =
      await client.rpc(
        "adspy_creative_history",
        {
          p_query: query,
          p_country: country,
          p_platform: platform,
          p_mode: mode,
          p_limit: limit,
        },
      );

    if (error) {
      throw new Error(
        `History query failed: ${error.message}`,
      );
    }

    return NextResponse.json({
      success: true,
      query,
      country,
      platform,
      mode,
      versions: data ?? [],
    });
  } catch (error) {
    console.error(
      "[AdSpy history]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "History query failed.",
      },
      { status: 500 },
    );
  }
}