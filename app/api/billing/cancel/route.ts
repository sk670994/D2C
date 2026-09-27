import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { cancelSubscription, fetchSubscription, getBillingRow } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/** Cancel at the end of the paid period (access continues until then). */
export async function POST() {
  const auth = await createServerAuthClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const row = await getBillingRow(user.id);
  if (!row?.razorpay_subscription_id || (row.status !== "active" && row.status !== "past_due")) {
    return NextResponse.json({ success: false, error: "There is no active plan to cancel." }, { status: 400 });
  }
  try {
    await cancelSubscription(row.razorpay_subscription_id);
    // Keep access until the end of the paid period.
    const sub = await fetchSubscription(row.razorpay_subscription_id).catch(() => null);
    const periodEnd = sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : row.current_period_end;
    await createGlobalServiceClient()
      .from("billing_subscriptions")
      .update({ status: "cancelled", current_period_end: periodEnd, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[billing] cancel failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not cancel right now. Try again or write to us." }, { status: 502 });
  }
}
