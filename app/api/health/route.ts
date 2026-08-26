import { NextResponse } from "next/server";

import {
  createGlobalServiceClient,
} from "@/lib/ad-intelligence/global/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase =
      createGlobalServiceClient();

    const {
      error,
    } = await supabase
      .from("ad_intelligence_brands")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          db: "unreachable",
          error: error.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      db: "reachable",
      latencyMs:
        Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 503 },
    );
  }
}