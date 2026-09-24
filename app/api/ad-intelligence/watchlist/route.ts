import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/ad-intelligence/auth-claims";

export const runtime = "nodejs";
// Run next to the Supabase database (ap-southeast-2 / Sydney).
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/** The signed-in user's watched advertisers (newest first). */
export async function GET() {
  const auth = await createServerAuthClient();
  const userId = await getVerifiedUserId(auth);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await auth
    .from("adspy_advertiser_watchlists")
    .select("advertiser_id,advertiser_name,country,updated_at")
    .eq("user_id", userId)
    .eq("platform", "meta")
    .order("updated_at", { ascending: false })
    .limit(24);

  if (error) {
    return NextResponse.json({ success: false, error: "Could not load your watchlist." }, { status: 500 });
  }

  const brands = (data ?? [])
    .filter((row) => /^\d+$/.test(String(row.advertiser_id ?? "")))
    .map((row) => ({
      pageId: String(row.advertiser_id),
      name: String(row.advertiser_name || `Page ${row.advertiser_id}`),
      country: String(row.country || "IN").toUpperCase(),
    }));

  return NextResponse.json({ success: true, brands });
}
