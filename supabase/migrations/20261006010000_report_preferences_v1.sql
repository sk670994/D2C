-- Each user picks when their rival report arrives (daily / weekly + day / off,
-- hour in IST) and whether instant rival alerts are on. No row = defaults
-- (weekly, Monday 9 AM IST, alerts on). Read and written only by the server.
CREATE TABLE IF NOT EXISTS public.report_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'off')),
  weekday SMALLINT NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 1 AND 7),
  hour SMALLINT NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
  alerts BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.report_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_preferences FROM anon, authenticated;
