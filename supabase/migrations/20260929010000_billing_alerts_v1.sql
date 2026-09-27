-- Billing, customer alerts and ops alerts (v1)
--
-- billing_subscriptions: one row per user. Trial on first visit, then a
--   Razorpay subscription. Written only by the server (service role);
--   users can read their own row.
-- billing_events: Razorpay webhook log, keyed by event id (idempotency).
-- alert_deliveries: which "big move" alerts a user already got (no repeats).
-- ops_alerts: throttle for founder alerts (worker down, queue stuck ...).
--
-- Additive only. Rollback:
--   DROP TABLE public.billing_events, public.billing_subscriptions,
--              public.alert_deliveries, public.ops_alerts;

BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'growth', 'agency')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  pending_plan TEXT CHECK (pending_plan IS NULL OR pending_plan IN ('starter', 'growth', 'agency')),
  razorpay_subscription_id TEXT UNIQUE,
  previous_subscription_id TEXT,
  razorpay_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO service_role;
DROP POLICY IF EXISTS billing_subscriptions_read_own ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_read_own ON public.billing_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  subscription_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_events TO service_role;

CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_key)
);
ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alert_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_deliveries TO service_role;

CREATE TABLE IF NOT EXISTS public.ops_alerts (
  alert_key TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail TEXT
);
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_alerts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_alerts TO service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260929010000', 'billing_alerts_v1')
ON CONFLICT DO NOTHING;

COMMIT;
