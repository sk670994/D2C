import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";
import { getToday } from "@/lib/today/load";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getVerifiedUserId(await createServerAuthClient());
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const today = await getToday(userId);
    return NextResponse.json({ success: true, ...today }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    console.error("[Today]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not build Today." }, { status: 500 });
  }
}
