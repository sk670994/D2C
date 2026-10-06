import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { isPaidPlan, PLANS } from "@/lib/billing/plans";
import { createSubscription, razorpayConfigured } from "@/lib/billing/server";
import { checkSharedRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

/** Create a Razorpay subscription for the chosen plan; the page opens Checkout with its id. */
export async function POST(request: NextRequest) {
  const auth = await createServerAuthClient();
  const { data } = await auth.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!razorpayConfigured()) return NextResponse.json({ success: false, error: "Payments are not switched on yet. Write to us and we will set up your plan." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!isPaidPlan(body.plan)) return NextResponse.json({ success: false, error: "Choose Starter, Growth or Agency." }, { status: 400 });

  const limited = await checkSharedRateLimit(`billing-checkout:${user.id}`, 10, 3_600_000);
  if (!limited.allowed) return NextResponse.json({ success: false, error: "Too many attempts. Try again in a while." }, { status: 429 });

  try {
    const sub = await createSubscription(user.id, body.plan, user.email ?? null);
    return NextResponse.json({
      success: true,
      subscriptionId: sub.id,
      shortUrl: sub.shortUrl,
      keyId: process.env.RAZORPAY_KEY_ID?.trim(),
      plan: PLANS[body.plan],
      email: user.email ?? null,
    });
  } catch (error) {
    console.error("[billing] checkout failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not start checkout. Try again or write to us." }, { status: 502 });
  }
}
