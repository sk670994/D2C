# Launch setup: billing, email, alerts, 24/7 collector

Work through these once, in order. Never paste keys into chat or commit them.

## 1. Database (Supabase, 1 minute)
SQL Editor → paste `supabase/migrations/20260929010000_billing_alerts_v1.sql` → Run.
Until this runs, everyone gets the 7-day-trial allowance and nothing breaks.

## 2. Razorpay (payments)
1. Sign up at razorpay.com and complete KYC (business PAN, bank account, GST if you have it).
2. Settings → API Keys → generate. Subscriptions → Plans → create 3 monthly plans:
   Starter ₹1,999, Growth ₹4,999, Agency ₹12,999. Copy each `plan_...` id.
3. Settings → Webhooks → Add:
   - URL: `https://www.zooptrack.co.in/api/billing/webhook`
   - Secret: any long random string
   - Events: all `subscription.*`
4. Vercel → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| RAZORPAY_KEY_ID | rzp_live_… |
| RAZORPAY_KEY_SECRET | … |
| RAZORPAY_WEBHOOK_SECRET | the webhook secret |
| RAZORPAY_PLAN_STARTER | plan_… |
| RAZORPAY_PLAN_GROWTH | plan_… |
| RAZORPAY_PLAN_AGENCY | plan_… |
| ZOOPTRACK_ADMIN_EMAILS | your login email(s), comma separated (no limits for you) |

Test first with `rzp_test_` keys and test plans, then switch to live keys.

## 3. Email (Resend)
1. resend.com → Domains → add `zooptrack.co.in` → add the DNS records it shows → Verify.
2. API Keys → create.
3. Vercel env:

| Name | Value |
|---|---|
| RESEND_API_KEY | re_… |
| REPORT_FROM_EMAIL | Zooptrack <reports@zooptrack.co.in> |
| OPS_ALERT_EMAIL | your email (worker-down alerts) |

## 4. Cron secret (GitHub + Vercel)
- Vercel env `CRON_SECRET` = a long random string (skip if already set).
- GitHub repo → Settings → Secrets → Actions → `CRON_SECRET` = the same value.
  This lets the 30-minute health check (`.github/workflows/ops-health.yml`) run.

Redeploy on Vercel after changing env vars.

## 5. 24/7 collector (when you have customers)
See `worker/README.md` → "Run it 24/7 on a cloud server".

## What runs when (IST)
| Time | Job |
|---|---|
| 02:00 daily | refresh watched rivals (worker) |
| 02:30 daily | AI decoding catch-up |
| 08:00 daily | big-move alerts (Growth, Agency, trial) |
| 08:45 daily + every 30 min (GitHub) | ops health check |
| Mon 09:00 | Monday report (active trial / paid only) |
