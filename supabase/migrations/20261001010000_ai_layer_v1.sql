-- AI layer v1: cost ledger, landing pages, label search index.
-- Safe to run more than once. Everything here is optional for the app: code
-- that uses these tables skips quietly until they exist.

-- 1) AI cost ledger: one row per model call (Jev, Gemini, Jina) ---------------
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL,              -- jev | gemini | jina
  model         text NOT NULL,
  purpose       text NOT NULL,              -- ad_labels | ad_visual_read | landing_page | landing_offer_match
  creative_id   uuid,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  cost_usd      numeric(12, 8) NOT NULL DEFAULT 0,  -- estimate from list prices
  ok            boolean NOT NULL DEFAULT true,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON public.ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_provider_created_idx ON public.ai_calls (provider, created_at DESC);
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_calls FROM anon, authenticated;

-- Spend per day and provider (for SQL checks / a future admin page).
CREATE OR REPLACE VIEW public.ai_spend_daily
WITH (security_invoker = true) AS
SELECT date_trunc('day', created_at) AS day, provider, purpose,
       count(*) AS calls, sum(cost_usd) AS usd,
       sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens,
       count(*) FILTER (WHERE NOT ok) AS failed
FROM public.ai_calls
GROUP BY 1, 2, 3;
REVOKE ALL ON public.ai_spend_daily FROM anon, authenticated;

-- 2) Landing pages (Jina Reader) and per-ad offer checks ----------------------
CREATE TABLE IF NOT EXISTS public.landing_pages (
  url_key    text PRIMARY KEY,               -- host + path, no query string
  url        text,
  title      text,
  prices     integer[] NOT NULL DEFAULT '{}',
  offers     text[] NOT NULL DEFAULT '{}',
  excerpt    text,
  status     text NOT NULL DEFAULT 'ok',     -- ok | failed
  error      text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.landing_pages FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ad_landing_checks (
  creative_id    uuid PRIMARY KEY REFERENCES public.ad_intelligence_creatives(id) ON DELETE CASCADE,
  advertiser_id  text,
  url_key        text NOT NULL,
  ad_offers      text[] NOT NULL DEFAULT '{}',
  page_offers    text[] NOT NULL DEFAULT '{}',
  offers_overlap boolean,
  jev_match      real,                        -- Jev: probability the page shows the ad's deal
  checked_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_landing_checks_advertiser_idx ON public.ad_landing_checks (advertiser_id);
ALTER TABLE public.ad_landing_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_landing_checks FROM anon, authenticated;

-- 3) Ad finder: label search over decodes (jsonb containment) -----------------
CREATE INDEX IF NOT EXISTS ad_creative_decodes_elements_gin
  ON public.ad_creative_decodes USING gin (elements jsonb_path_ops);

-- 4) What-changed: fast "new versions this week" per ad -----------------------
CREATE INDEX IF NOT EXISTS ad_intelligence_creative_versions_creative_first_idx
  ON public.ad_intelligence_creative_versions (creative_id, first_observed_at DESC);
