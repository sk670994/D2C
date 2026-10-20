import { NextResponse } from "next/server";
import { NEW_BRANDS_PER_DAY } from "@/lib/ad-intelligence/credit-guard";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getVerifiedUserFrom } from "@/lib/supabase/user";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { PAID_PLANS, PLANS } from "@/lib/billing/plans";
import { getEntitlement, razorpayConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/** Current plan, usage and the plans on offer. */
export async function GET() {
  const user = await getVerifiedUserFrom(await createServerAuthClient());
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  // Independent reads, fetched together. The trial counter is read up front
  // and only used for trialing, non-admin accounts (one primary-key read).
  const service = createGlobalServiceClient();
  const [entitlement, { count }, { data: hit }] = await Promise.all([
    getEntitlement(user.id, user.email),
    service
      .from("adspy_advertiser_watchlists")
      .select("advertiser_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("platform", "meta"),
    // Trial: brand searches used so far (the counter takeUserBrandSlot writes).
    service.from("rate_limits").select("hits").eq("key", `adspy-live:${user.id}:trial`).limit(1),
  ]);

  let trialSearches = 0;
  if (entitlement.status === "trialing" && !entitlement.admin) {
    trialSearches = Math.max(0, Number((hit ?? [])[0]?.hits ?? 0) || 0);
  }

  return NextResponse.json({
    success: true,
    entitlement,
    usage: { rivals: count ?? 0, trialSearches: Math.min(trialSearches, NEW_BRANDS_PER_DAY.trial), trialSearchLimit: NEW_BRANDS_PER_DAY.trial },
    plans: PAID_PLANS.map((key) => PLANS[key]),
    checkoutReady: razorpayConfigured(),
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || null,
  }, { headers: { "Cache-Control": "private, max-age=60" } });
}
