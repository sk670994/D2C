import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";

import { entitlementFor, isAdminEmail, razorpayPlanEnv, TRIAL_DAYS, type Entitlement, type PaidPlanKey, type SubscriptionRow } from "./plans";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const COLUMNS = "user_id,plan,status,trial_ends_at,current_period_end,pending_plan,razorpay_subscription_id,previous_subscription_id";

export type BillingRow = SubscriptionRow & { user_id: string; pending_plan: string | null; razorpay_subscription_id: string | null; previous_subscription_id?: string | null };

function missingTable(message: string) {
  return /42P01|PGRST205|does not exist|schema cache/i.test(message);
}

/** The user's subscription row; creates the free trial on first visit. */
export async function getBillingRow(userId: string): Promise<BillingRow | null> {
  const client = createGlobalServiceClient();
  const { data, error } = await client.from("billing_subscriptions").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) {
    if (missingTable(error.message)) return null;
    throw new Error(error.message);
  }
  if (data) return data as BillingRow;
  const trial = { user_id: userId, plan: "trial", status: "trialing", trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString() };
  const inserted = await client.from("billing_subscriptions").upsert(trial, { onConflict: "user_id", ignoreDuplicates: true }).select(COLUMNS).maybeSingle();
  if (inserted.data) return inserted.data as BillingRow;
  const again = await client.from("billing_subscriptions").select(COLUMNS).eq("user_id", userId).maybeSingle();
  return (again.data as BillingRow | null) ?? null;
}

/**
 * What the user may do now. Before the billing migration runs, everyone
 * gets the trial allowance (never locked out by a missing table).
 */
export async function getEntitlement(userId: string, email?: string | null): Promise<Entitlement> {
  const admin = isAdminEmail(email, process.env.ZOOPTRACK_ADMIN_EMAILS);
  if (admin) return entitlementFor(null, Date.now(), { admin: true });
  const row = await getBillingRow(userId).catch(() => null);
  return entitlementFor(row);
}

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function razorpay<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method,
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!response.ok) throw new Error(body.error?.description || `Razorpay ${response.status}`);
  return body;
}

/** Start a Razorpay subscription for a plan; the checkout then collects the mandate. */
export async function createSubscription(userId: string, plan: PaidPlanKey, email: string | null): Promise<{ id: string; shortUrl: string | null }> {
  const planId = process.env[razorpayPlanEnv(plan)]?.trim();
  if (!planId) throw new Error(`Set ${razorpayPlanEnv(plan)} to the Razorpay plan id for ${plan}.`);
  const sub = await razorpay<{ id: string; short_url?: string }>("/subscriptions", {
    method: "POST",
    body: { plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1, notes: { user_id: userId, plan, email: email ?? "" } },
  });
  const client = createGlobalServiceClient();
  const current = await getBillingRow(userId);
  // Which subscription is really paying right now:
  // - a switch is already pending (an earlier checkout was opened but not paid):
  //   the paying one is still previous_subscription_id; never lose it;
  // - otherwise, if the account is live, the current subscription id.
  const pendingSwitch = Boolean(current?.pending_plan);
  const live = current?.status === "active" || current?.status === "past_due";
  const previous = pendingSwitch ? current?.previous_subscription_id ?? null : live ? current?.razorpay_subscription_id ?? null : null;
  // An earlier checkout that was never paid: cancel it so it cannot be paid later
  // (no orphan subscriptions, no surprise second charge).
  const abandoned = pendingSwitch && current?.razorpay_subscription_id && current.razorpay_subscription_id !== previous ? current.razorpay_subscription_id : null;
  const { error } = await client
    .from("billing_subscriptions")
    .update({ pending_plan: plan, razorpay_subscription_id: sub.id, razorpay_plan_id: planId, previous_subscription_id: previous, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (abandoned) await cancelUnpaid(abandoned);
  return { id: sub.id, shortUrl: sub.short_url ?? null };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await razorpay(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 1 } });
}

export async function fetchSubscription(subscriptionId: string): Promise<{ id: string; status: string; current_end: number | null; plan_id: string; notes?: Record<string, string> }> {
  return razorpay(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout success: razorpay_payment_id|razorpay_subscription_id signed with the key secret. */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook: raw body signed with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Apply a new state to the row that owns this Razorpay subscription. */
export async function applySubscriptionState(
  subscriptionId: string,
  next: { status: string; currentPeriodEnd: string | null },
  fallbackUserId?: string | null,
): Promise<boolean> {
  const client = createGlobalServiceClient();
  let { data } = await client.from("billing_subscriptions").select("user_id,pending_plan,plan,previous_subscription_id").eq("razorpay_subscription_id", subscriptionId).maybeSingle();
  if (!data && fallbackUserId) {
    const byUser = await client.from("billing_subscriptions").select("user_id,pending_plan,plan,previous_subscription_id,razorpay_subscription_id").eq("user_id", fallbackUserId).maybeSingle();
    // Only adopt a row that is not already tied to a different subscription
    // (events for an old, replaced subscription must not touch the new one).
    const owned = byUser.data as { razorpay_subscription_id: string | null } | null;
    data = owned && (!owned.razorpay_subscription_id || owned.razorpay_subscription_id === subscriptionId) ? byUser.data : null;
  }
  if (!data) return false;
  const row = data as { user_id: string; pending_plan: string | null; plan: string; previous_subscription_id: string | null };
  const update: Record<string, unknown> = { status: next.status, updated_at: new Date().toISOString(), razorpay_subscription_id: subscriptionId };
  if (next.currentPeriodEnd) update.current_period_end = next.currentPeriodEnd;
  if (next.status === "active" && row.pending_plan) {
    update.plan = row.pending_plan;
    update.pending_plan = null;
  }
  const cancelOld = next.status === "active" && row.previous_subscription_id && row.previous_subscription_id !== subscriptionId ? row.previous_subscription_id : null;
  const { error } = await client.from("billing_subscriptions").update(update).eq("user_id", row.user_id);
  if (error) throw new Error(error.message);
  // The new plan is live: stop billing the old one now. previous_subscription_id is
  // cleared only once Razorpay confirms; otherwise ops-health retries every 30 min.
  if (cancelOld) await cancelPreviousSubscription(row.user_id, cancelOld);
  return true;
}

async function cancelPreviousSubscription(userId: string, subscriptionId: string): Promise<boolean> {
  try {
    await razorpay(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 0 } });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    // Already cancelled/completed at Razorpay counts as done.
    if (!/cancel|complete|expired/i.test(message)) {
      console.warn("[billing] could not cancel previous subscription; will retry", subscriptionId, message);
      return false;
    }
  }
  await createGlobalServiceClient()
    .from("billing_subscriptions")
    .update({ previous_subscription_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("previous_subscription_id", subscriptionId);
  return true;
}

/** Cancel a subscription that was created at checkout but never paid. Best effort. */
async function cancelUnpaid(subscriptionId: string): Promise<void> {
  await razorpay(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 0 } }).catch((reason) =>
    console.warn("[billing] could not cancel unpaid checkout", subscriptionId, reason instanceof Error ? reason.message : reason),
  );
}

/**
 * Safety net for plan switches: any live account that still has an old
 * subscription recorded gets it cancelled (called by ops-health every 30 min).
 * Returns how many old subscriptions are still not cancelled.
 */
export async function reconcilePlanSwitches(): Promise<number> {
  if (!razorpayConfigured()) return 0;
  const { data } = await createGlobalServiceClient()
    .from("billing_subscriptions")
    .select("user_id,status,razorpay_subscription_id,previous_subscription_id,pending_plan")
    .not("previous_subscription_id", "is", null)
    .is("pending_plan", null)
    .limit(50);
  let left = 0;
  for (const row of (data ?? []) as Array<{ user_id: string; status: string; razorpay_subscription_id: string | null; previous_subscription_id: string }>) {
    if (row.status !== "active" || row.previous_subscription_id === row.razorpay_subscription_id) continue;
    if (!(await cancelPreviousSubscription(row.user_id, row.previous_subscription_id))) left += 1;
  }
  return left;
}
