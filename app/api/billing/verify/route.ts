import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { statusFromRazorpay } from "@/lib/billing/plans";
import { applySubscriptionState, fetchSubscription, getBillingRow, verifyCheckoutSignature } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/**
 * Checkout success handler. Checks Razorpay's signature, then reads the
 * subscription from Razorpay itself (never trusts the browser) and applies it.
 * The webhook does the same later; both are idempotent.
 */
export async function POST(request: NextRequest) {
  const auth = await createServerAuthClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const paymentId = String(body.razorpay_payment_id ?? "");
  const subscriptionId = String(body.razorpay_subscription_id ?? "");
  const signature = String(body.razorpay_signature ?? "");
  if (!verifyCheckoutSignature(paymentId, subscriptionId, signature)) {
    return NextResponse.json({ success: false, error: "Payment could not be verified." }, { status: 400 });
  }

  const row = await getBillingRow(user.id);
  if (!row || row.razorpay_subscription_id !== subscriptionId) {
    return NextResponse.json({ success: false, error: "This payment is not for your account." }, { status: 403 });
  }

  try {
    const sub = await fetchSubscription(subscriptionId);
    // "authenticated" = mandate set up, first charge on its way: treat as live.
    const event = sub.status === "active" || sub.status === "authenticated" ? "subscription.activated" : `subscription.${sub.status}`;
    const next = statusFromRazorpay(event, { status: sub.status === "authenticated" ? "active" : sub.status, current_end: sub.current_end });
    if (next) await applySubscriptionState(subscriptionId, next, user.id);
    return NextResponse.json({ success: true, status: next?.status ?? sub.status });
  } catch (error) {
    console.error("[billing] verify failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Paid, but we could not confirm it yet. It will show within a few minutes." }, { status: 502 });
  }
}
