import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { PAID_PLANS, PLANS } from "@/lib/billing/plans";
import { getEntitlement, razorpayConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/** Current plan, usage and the plans on offer. */
export async function GET() {
  const auth = await createServerAuthClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const entitlement = await getEntitlement(user.id, user.email);
  const { count } = await createGlobalServiceClient()
    .from("adspy_advertiser_watchlists")
    .select("advertiser_id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("platform", "meta");

  return NextResponse.json({
    success: true,
    entitlement,
    usage: { rivals: count ?? 0 },
    plans: PAID_PLANS.map((key) => PLANS[key]),
    checkoutReady: razorpayConfigured(),
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || null,
  });
}
