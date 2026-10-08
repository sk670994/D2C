# Launch setup: billing, email, alerts, 24/7 collector

Work through these once, in order. Never paste keys into chat or commit them.

## 1. Database (Supabase, 1 minute)
SQL Editor → paste `supabase/migrations/20260929010000_billing_alerts_v1.sql` → Run.
Until this runs, everyone gets the 7-day-trial allowance and nothing breaks.

## 2. Razorpay (payments)
1. Sign up at razorpay.com and complete KYC (business PAN, bank account, GST if you have it).
2. Settings → API Keys → generate. Subscriptions → Plans → create 3 monthly plans:
   Starter ₹999, Growth ₹2,999, Agency ₹7,999 (monthly). Copy each `plan_...` id.
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

## 5. 24/7 collector on Vercel (no PC)
Two paid sources plug into the same pipeline. Pick one (or test both):

| Source | Price | Key name |
|---|---|---|
| **ScrapeCreators** (cheapest to start) | 100 free credits (+ bonus), then $47 for 25,000 credits that never expire; 1 credit ≈ 30 ads | `SCRAPECREATORS_API_KEY` |
| SearchApi | $40/month for 10,000 calls | `SEARCHAPI_API_KEY` |

1. Put the key(s) in `worker\.env` (no quotes) and run the read-only check:
   `npx tsx scripts/ops/searchapi-benchmark.ts` (compares every source with a key;
   `--source scrapecreators` for one). Send the table.
2. If the numbers look right, add in Vercel (Production), then redeploy:
   | Name | Value |
   |---|---|
   | `SCRAPECREATORS_API_KEY` or `SEARCHAPI_API_KEY` | your key (Sensitive) |
   | `ADSPY_COLLECTOR` | `searchapi` (means "collect on Vercel via an API"; replaces `worker`) |
   | `ADSPY_DRAIN_URL` | `https://www.zooptrack.co.in/api/adspy/drain` |
   | `ADSPY_META_SOURCE` | optional: `scrapecreators` or `searchapi` (default: ScrapeCreators when its key is set) |
3. Test: search a brand you have never searched in Discover ads; ads appear
   within about a minute. Vercel logs show `[AdSpy collect] API source` lines.
4. Stop the PC worker (Ctrl+C). Collection, AI labels and landing checks run on Vercel.

Roll back any time: set `ADSPY_COLLECTOR` back to `worker`, redeploy, start
`worker\start-worker.ps1`.

## 6. AI layer (Jev + Gemini + Jina) and images on R2
Run `supabase/migrations/20261001010000_ai_layer_v1.sql` once in the SQL editor
(cost ledger, landing pages, finder index). Then add in Vercel:

| Name | Value | What it does |
|---|---|---|
| `TYPESAFE_API_KEY` | from console.typesafe.ai/settings/keys | Jev labels every ad's copy (hook, angle, audience, language, emotion, offer) and judges landing pages. Without it, Gemini labels every ad as before. |
| `GEMINI_API_KEY` | (already set) | Reads images; with Jev on, only for watched brands, ads live 7+ days and launches. |
| `JINA_API_KEY` | optional, free key at jina.ai | Landing pages: 500 instead of 20 pages/min. Works without. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 bucket + API token (Object Read & Write) + the bucket's public URL | New ad images go to R2 (10 GB free) instead of Supabase (1 GB). |

Move existing images (put the same R2 values in `worker\.env`):
`npx tsx scripts/ops/media-to-r2.ts` (dry run) → `--apply` → `--apply --delete-old`.

AI spend: `/api/cron/ops-health` shows `aiSpend24h`; SQL: `select * from ai_spend_daily order by day desc;`.
New in the app: **Ad finder** (/today/finder), **Changed** moves on Today and in
alerts (offer/price changes on live ads), landing-page checks on brand pages.

## What runs when (IST)
| Time | Job |
|---|---|
| 02:00 daily | refresh watched rivals (worker) |
| 02:15 daily | drain the queue on Vercel (API mode): collect, then AI labels, then landing pages |
| 02:30 daily | AI decoding catch-up |
| 08:00 daily | big-move alerts (Growth, Agency, trial) |
| 08:45 daily + every 30 min (GitHub) | ops health check |
| Mon 09:00 | Monday report (active trial / paid only) |
