"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import type { Entitlement, Plan } from "@/lib/billing/plans";

type BillingData = {
  entitlement: Entitlement;
  usage: { rivals: number };
  plans: Plan[];
  checkoutReady: boolean;
  keyId: string | null;
};

type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (payload: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_JS;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout did not load.")));
    script.onerror = () => reject(new Error("Could not load Razorpay. Check your connection."));
    document.body.appendChild(script);
  });
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

export function BillingView() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const body = (await response.json()) as { success: boolean; error?: string } & Partial<BillingData>;
      if (!response.ok || !body.success) throw new Error(body.error || "Could not load your plan.");
      setData(body as BillingData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your plan.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (plan: Plan) => {
    setBusy(plan.key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: plan.key }) });
      const body = (await response.json()) as { success: boolean; error?: string; subscriptionId?: string; keyId?: string; email?: string | null };
      if (!response.ok || !body.success || !body.subscriptionId) throw new Error(body.error || "Could not start checkout.");
      const Razorpay = await loadCheckout();
      await new Promise<void>((resolve) => {
        const checkout = new Razorpay({
          key: body.keyId,
          subscription_id: body.subscriptionId,
          name: "Zooptrack",
          description: `${plan.name} plan · ${inr(plan.priceInr)} / month`,
          prefill: body.email ? { email: body.email } : undefined,
          theme: { color: "#0255B1" },
          handler: async (payment: RazorpayResponse) => {
            const verify = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment) });
            const result = (await verify.json().catch(() => ({}))) as { success?: boolean; error?: string };
            if (result.success) setNotice(`You're on ${plan.name}. Thank you!`);
            else setError(result.error || "Paid, but not confirmed yet. It will show in a few minutes.");
            await load();
            resolve();
          },
          modal: { ondismiss: () => resolve() },
        });
        checkout.on("payment.failed", () => {
          setError("The payment did not go through. No money was taken; try again or use another method.");
          resolve();
        });
        checkout.open();
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your plan? You keep access until the end of the period you paid for.")) return;
    setBusy("cancel");
    setError("");
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      const body = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error || "Could not cancel.");
      setNotice("Cancelled. You keep access until the end of this period.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return error ? (
      <p className="zd-error" role="alert">
        {error}
      </p>
    ) : (
      <div className="zd-col" aria-busy="true">
        <div className="zd-skel" style={{ height: 140 }} />
        <div className="zd-grid-3">
          <div className="zd-skel" style={{ height: 320 }} />
          <div className="zd-skel" style={{ height: 320 }} />
          <div className="zd-skel" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  const { entitlement: e, usage } = data;
  const pct = Math.min(100, Math.round((usage.rivals / Math.max(1, e.rivalsLimit)) * 100));
  const paid = e.plan !== "trial" && (e.status === "active" || e.status === "past_due");

  return (
    <>
      <header className="zd-col" style={{ gap: 10 }}>
        <div className="zd-eyebrow">Plan & billing</div>
        <h1 className="zd-h1">{e.label}.</h1>
        <p className="zd-lede">Prices in INR, billed monthly by Razorpay (UPI AutoPay or card). Payment receipt by email. Cancel any time; you keep access to the end of the month you paid for.</p>
      </header>

      <section className="zd-card" aria-label="Usage" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <div className="zd-col" style={{ gap: 2, flex: "0 0 220px" }}>
          <span className="zd-muted" style={{ fontSize: 13 }}>
            Rivals watched
          </span>
          <span className="zd-num" style={{ fontSize: 30 }}>
            {usage.rivals} / {e.rivalsLimit}
          </span>
        </div>
        <div className="zd-col" style={{ gap: 8, flex: 1, minWidth: 220 }}>
          <div className="zd-bar" style={{ height: 12 }} role="img" aria-label={`${pct}% of your rival limit used`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="zd-muted" style={{ fontSize: 13 }}>
            {e.trialDaysLeft !== null && e.status === "trialing" ? `${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? "day" : "days"} of your free trial left.` : e.renewsAt ? `Renews ${new Date(e.renewsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}.` : " "}
          </span>
        </div>
        {paid ? (
          <button type="button" className="zd-btn" onClick={() => void cancel()} disabled={busy !== null}>
            {busy === "cancel" ? <Loader2 size={15} className="zd-spin" aria-hidden="true" /> : null}
            Cancel plan
          </button>
        ) : null}
      </section>

      {notice ? (
        <p className="zd-pill zd-pill-good" role="status" style={{ alignSelf: "flex-start", fontSize: 14, minHeight: 36, padding: "0 14px" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="zd-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      {!data.checkoutReady ? (
        <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
          Online payment is being switched on. To start a plan now, write to hello.zooptrack@gmail.com.
        </p>
      ) : null}

      <div className="zd-grid-3">
        {data.plans.map((plan) => {
          const current = paid && e.plan === plan.key;
          return (
            <article key={plan.key} className="zd-card" style={plan.key === "growth" ? { borderColor: "var(--zd-accent)", boxShadow: "0 0 0 1px var(--zd-accent)" } : undefined}>
              <div className="zd-row">
                <h2 className="zd-h3" style={{ margin: 0 }}>
                  {plan.name}
                </h2>
                {plan.key === "growth" ? (
                  <span className="zd-pill zd-pill-quiet" style={{ marginLeft: "auto" }}>
                    Most teams
                  </span>
                ) : null}
              </div>
              <p className="zd-muted" style={{ margin: 0, fontSize: 14 }}>
                {plan.audience}
              </p>
              <div>
                <span className="zd-num" style={{ fontSize: 40 }}>
                  {inr(plan.priceInr)}
                </span>
                <span className="zd-muted"> / month</span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.features.map((f) => (
                  <li key={f} className="zd-row" style={{ gap: 8, alignItems: "flex-start", fontSize: 15 }}>
                    <Check size={16} aria-hidden="true" style={{ color: "var(--zd-good)", marginTop: 3, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`zd-btn${plan.key === "growth" ? " zd-btn-primary" : ""}`}
                style={{ marginTop: "auto" }}
                disabled={current || busy !== null || !data.checkoutReady}
                onClick={() => void choose(plan)}
              >
                {busy === plan.key ? <Loader2 size={15} className="zd-spin" aria-hidden="true" /> : null}
                {current ? "Your plan" : paid ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
