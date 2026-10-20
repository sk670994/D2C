import { NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { cancelSubscription, cancelUnpaid, fetchSubscription, getBillingRow } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/**
 * Cancel at the end of the paid period (access continues until then).
 *
 * During a plan switch (pending_plan set) razorpay_subscription_id is the new,
 * not-yet-paid checkout and previous_subscription_id is the one actually
 * billing. Then the unpaid checkout is cancelled now (so it cannot be paid
 * later) and the paying subscription is cancelled at cycle end.
 */
export async function POST() {
  const auth = await createServerAuthClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const row = await getBillingRow(user.id).catch((error) => {
    console.error("[billing] cancel: billing row lookup failed", error instanceof Error ? error.message : error);
    return null;
  });
  if (!row?.razorpay_subscription_id || (row.status !== "active" && row.status !== "past_due")) {
    return NextResponse.json({ success: false, error: "There is no active plan to cancel." }, { status: 400 });
  }
  const previous = row.previous_subscription_id ?? null;
  const unpaid = row.pending_plan && previous && row.razorpay_subscription_id !== previous ? row.razorpay_subscription_id : null;
  const paying = previous ?? row.razorpay_subscription_id;
  try {
    if (unpaid) await cancelUnpaid(unpaid);
    await cancelSubscription(paying);
    // Keep access until the end of the paid period.
    const sub = await fetchSubscription(paying).catch(() => null);
    const periodEnd = sub?.current_end ? new Date(sub.current_end * 1000).toISOString() : row.current_period_end;
    await createGlobalServiceClient()
      .from("billing_subscriptions")
      .update({
        status: "cancelled",
        current_period_end: periodEnd,
        pending_plan: null,
        // The row now points at the subscription that was really paying, so
        // webhooks for the cancelled checkout cannot touch it.
        razorpay_subscription_id: paying,
        previous_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[billing] cancel failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not cancel right now. Try again or write to us." }, { status: 502 });
  }
}
