import { NextRequest, NextResponse } from "next/server";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { statusFromRazorpay } from "@/lib/billing/plans";
import { applySubscriptionState, verifyWebhookSignature } from "@/lib/billing/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

type SubscriptionEntity = { id?: string; status?: string; current_end?: number | null; plan_id?: string; notes?: Record<string, string> };

/**
 * Razorpay webhook (Dashboard > Webhooks > this URL, secret = RAZORPAY_WEBHOOK_SECRET,
 * events: subscription.*). Signature-checked and idempotent by event id.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { event?: string; payload?: { subscription?: { entity?: SubscriptionEntity } } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = String(body.event ?? "");
  const entity = body.payload?.subscription?.entity;
  const eventId = request.headers.get("x-razorpay-event-id") || `${event}:${entity?.id ?? ""}:${entity?.current_end ?? ""}:${entity?.status ?? ""}`;
  const client = createGlobalServiceClient();

  const logged = await client.from("billing_events").insert({ event_id: eventId, event, subscription_id: entity?.id ?? null, payload: body });
  if (logged.error && /duplicate key|23505/i.test(logged.error.message)) return NextResponse.json({ ok: true, duplicate: true });

  if (!entity?.id) return NextResponse.json({ ok: true, ignored: true });
  const next = statusFromRazorpay(event, entity);
  if (!next) return NextResponse.json({ ok: true, ignored: true });

  try {
    const applied = await applySubscriptionState(entity.id, next, entity.notes?.user_id ?? null);
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    console.error("[billing] webhook apply failed", event, error instanceof Error ? error.message : error);
    // Let Razorpay retry, and allow the retry past the idempotency check.
    await client.from("billing_events").delete().eq("event_id", eventId);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
