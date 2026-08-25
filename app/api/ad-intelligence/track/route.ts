import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { trackBrand } from "@/lib/ad-intelligence/global/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await createServerAuthClient();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const query = String(body?.query ?? "").trim();
    const country = String(body?.country ?? "IN").trim().toUpperCase();
    const platform = String(body?.platform ?? "meta").trim().toLowerCase();

    if (!query) {
      return NextResponse.json({ success: false, error: "Missing query." }, { status: 400 });
    }

    await trackBrand({
      userId: user.id,
      query,
      country,
      platform: platform as "meta" | "google" | "linkedin",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AdIntelligenceTrack] Failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to track search." },
      { status: 500 },
    );
  }
}
