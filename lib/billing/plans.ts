/**
 * Plans, limits and subscription state. Pure (no I/O) so it is unit-tested
 * and shared by the API, the watch limit and the pricing page.
 * Prices are what the pricing page shows; the Razorpay plan ids (env) are
 * what customers are actually charged, so keep the two in step.
 */

export type PlanKey = "trial" | "starter" | "growth" | "agency";
export type PaidPlanKey = Exclude<PlanKey, "trial">;
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "expired";

export type Plan = {
  key: PlanKey;
  name: string;
  priceInr: number;
  audience: string;
  rivals: number;
  alerts: boolean;
  features: string[];
};

export const TRIAL_DAYS = 7;
/** Grace after a failed renewal before the account stops adding rivals. */
export const PAST_DUE_GRACE_DAYS = 5;

export const PLANS: Record<PlanKey, Plan> = {
  trial: {
    key: "trial",
    name: "Free trial",
    priceInr: 0,
    audience: `${TRIAL_DAYS} days, no card`,
    rivals: 5,
    alerts: true,
    features: ["5 rivals", "Today + email report", "AI ad decoding", "Big-move alerts"],
  },
  starter: {
    key: "starter",
    name: "Starter",
    priceInr: 999,
    audience: "Founders watching a few rivals",
    rivals: 5,
    alerts: false,
    features: ["5 rivals", "Today: rival moves with evidence", "Daily or weekly email report", "AI ad decoding"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceInr: 2999,
    audience: "Brand and growth teams",
    rivals: 15,
    alerts: true,
    features: ["15 rivals", "Everything in Starter", "Big-move alerts by email", "Your brand vs every rival"],
  },
  agency: {
    key: "agency",
    name: "Agency",
    priceInr: 7999,
    audience: "Agencies running many brands",
    rivals: 50,
    alerts: true,
    features: ["50 rivals across clients", "Everything in Growth", "Priority collection", "Client workspaces (coming soon)"],
  },
};

export const PAID_PLANS: PaidPlanKey[] = ["starter", "growth", "agency"];

/** Yearly billing: pay for 10 months, get 12 (about 17% off). */
export const YEARLY_MONTHS_CHARGED = 10;
export function yearlyPriceInr(plan: PaidPlanKey): number {
  return PLANS[plan].priceInr * YEARLY_MONTHS_CHARGED;
}

/** Launch offer: the first customers keep their price for a year. */
export const FOUNDING_OFFER = { spots: 20, lockMonths: 12 } as const;

export function isPaidPlan(value: unknown): value is PaidPlanKey {
  return typeof value === "string" && (PAID_PLANS as string[]).includes(value);
}

export type SubscriptionRow = {
  plan: string | null;
  status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export type Entitlement = {
  plan: PlanKey;
  planName: string;
  status: SubscriptionStatus;
  /** Can use paid features right now (trial running, paid, or in grace). */
  active: boolean;
  rivalsLimit: number;
  alerts: boolean;
  trialDaysLeft: number | null;
  renewsAt: string | null;
  /** One line for the UI. */
  label: string;
  admin: boolean;
};

const DAY = 86_400_000;

function ms(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** What a user may do now, from their subscription row (or none). */
export function entitlementFor(row: SubscriptionRow | null, now: number = Date.now(), options: { admin?: boolean } = {}): Entitlement {
  if (options.admin) {
    return { plan: "agency", planName: "Founder", status: "active", active: true, rivalsLimit: 500, alerts: true, trialDaysLeft: null, renewsAt: null, label: "Founder account", admin: true };
  }
  const planKey: PlanKey = row && (row.plan === "trial" || isPaidPlan(row.plan)) ? (row.plan as PlanKey) : "trial";
  const plan = PLANS[planKey];
  const status = (row?.status ?? "trialing") as SubscriptionStatus;
  const periodEnd = ms(row?.current_period_end);

  if (planKey === "trial" || status === "trialing") {
    const ends = ms(row?.trial_ends_at);
    const left = Number.isFinite(ends) ? Math.ceil((ends - now) / DAY) : TRIAL_DAYS;
    const running = left > 0;
    return {
      plan: "trial",
      planName: PLANS.trial.name,
      status: running ? "trialing" : "expired",
      active: running,
      rivalsLimit: PLANS.trial.rivals,
      alerts: running,
      trialDaysLeft: Math.max(0, left),
      renewsAt: null,
      label: running ? `Free trial · ${left} ${left === 1 ? "day" : "days"} left` : "Trial ended · choose a plan to keep collecting",
      admin: false,
    };
  }

  if (status === "active") {
    return { plan: planKey, planName: plan.name, status, active: true, rivalsLimit: plan.rivals, alerts: plan.alerts, trialDaysLeft: null, renewsAt: row?.current_period_end ?? null, label: `${plan.name} plan`, admin: false };
  }
  if (status === "past_due") {
    const inGrace = !Number.isFinite(periodEnd) || now - periodEnd < PAST_DUE_GRACE_DAYS * DAY;
    return {
      plan: planKey,
      planName: plan.name,
      status,
      active: inGrace,
      rivalsLimit: plan.rivals,
      alerts: inGrace && plan.alerts,
      trialDaysLeft: null,
      renewsAt: row?.current_period_end ?? null,
      label: inGrace ? "Payment failed · update your payment method" : "Payment overdue · choose a plan to keep collecting",
      admin: false,
    };
  }
  // Cancelled: paid access runs to the end of the period already paid for.
  const paidUp = Number.isFinite(periodEnd) && periodEnd > now;
  return {
    plan: planKey,
    planName: plan.name,
    status: paidUp ? "cancelled" : "expired",
    active: paidUp,
    rivalsLimit: plan.rivals,
    alerts: paidUp && plan.alerts,
    trialDaysLeft: null,
    renewsAt: null,
    label: paidUp ? `${plan.name} · cancelled, access until ${new Date(periodEnd).toISOString().slice(0, 10)}` : "Plan ended · choose a plan to keep collecting",
    admin: false,
  };
}

export type WatchDecision = { ok: true } | { ok: false; reason: "inactive" | "limit"; message: string };

/** May this user start watching one more rival? */
export function canWatchMore(entitlement: Entitlement, watchedCount: number, alreadyWatching: boolean): WatchDecision {
  if (alreadyWatching) return { ok: true };
  if (!entitlement.active) return { ok: false, reason: "inactive", message: "Your trial or plan has ended. Choose a plan to watch rivals again." };
  if (watchedCount >= entitlement.rivalsLimit) {
    return { ok: false, reason: "limit", message: `Your ${entitlement.planName} covers ${entitlement.rivalsLimit} rivals. Remove one or upgrade to watch more.` };
  }
  return { ok: true };
}

/** Razorpay subscription webhook -> our status. Null = ignore the event. */
export function statusFromRazorpay(event: string, entity: { status?: string | null; current_end?: number | null; plan_id?: string | null }): { status: SubscriptionStatus; currentPeriodEnd: string | null } | null {
  const end = typeof entity.current_end === "number" && entity.current_end > 0 ? new Date(entity.current_end * 1000).toISOString() : null;
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
    case "subscription.updated":
      return entity.status === "active" || entity.status === "authenticated" || event === "subscription.charged" ? { status: "active", currentPeriodEnd: end } : null;
    case "subscription.pending":
    case "subscription.halted":
      return { status: "past_due", currentPeriodEnd: end };
    case "subscription.cancelled":
    case "subscription.completed":
      return { status: "cancelled", currentPeriodEnd: end };
    default:
      return null;
  }
}

/** Env var holding the Razorpay plan id for a paid plan. */
export function razorpayPlanEnv(plan: PaidPlanKey): string {
  return `RAZORPAY_PLAN_${plan.toUpperCase()}`;
}

export function isAdminEmail(email: string | null | undefined, list: string | undefined): boolean {
  if (!email || !list) return false;
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export function formatInr(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(amount)}`;
}
