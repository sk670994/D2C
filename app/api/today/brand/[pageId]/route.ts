import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { getBrandOverview } from "@/lib/today/load";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ pageId: string }> }) {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { pageId: raw } = await context.params;
  const pageId = decodeURIComponent(raw).trim();
  if (!/^\d+$/.test(pageId)) return NextResponse.json({ success: false, error: "Invalid Meta Page ID." }, { status: 400 });
  const countryParam = (request.nextUrl.searchParams.get("country") ?? "IN").trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryParam) ? countryParam : "IN";

  try {
    const overview = await getBrandOverview(pageId, country);
    return NextResponse.json({ success: true, overview }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    console.error("[Today brand]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load brand." }, { status: 500 });
  }
}
