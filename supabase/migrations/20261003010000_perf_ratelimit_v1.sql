-- Hardening v2: hot-path indexes + a rate limiter shared by all Vercel instances.
-- Safe to re-run. Measured before (EXPLAIN ANALYZE, 29 Sep, 12.7k creatives):
--   decode picker  (platform, active, ORDER BY first_seen_at)  1,049 ms -> index scan
--   fresh feed     (platform, first_seen_at >= x, with thumb)     269 ms -> index scan

-- 1. Hot paths --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_active_first_seen_idx
  ON public.ad_intelligence_creatives (platform, is_currently_active, first_seen_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_fresh_feed_idx
  ON public.ad_intelligence_creatives (platform, first_seen_at DESC)
  WHERE advertiser_id IS NOT NULL AND thumbnail_url IS NOT NULL;

-- (platform) alone is covered by every (platform, ...) index; it only slows inserts.
DROP INDEX IF EXISTS public.ad_intelligence_creatives_platform_idx;

-- 2. Shared rate limiter ------------------------------------------------------
-- The in-memory limiter is per server instance; this one is one counter per key
-- for the whole deployment. Fixed window, one atomic statement.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hit AS (
    INSERT INTO public.rate_limits AS r (key, window_start, hits)
    VALUES (p_key, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END,
      hits         = CASE WHEN r.window_start <= now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END
    RETURNING r.hits, r.window_start
  )
  SELECT hits <= p_limit,
         greatest(0, p_limit - hits),
         greatest(1, ceil(extract(epoch FROM (window_start + make_interval(secs => p_window_seconds) - now())))::int)
  FROM hit;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- Old windows are useless after a day.
CREATE OR REPLACE FUNCTION public.rate_limits_prune() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.rate_limits_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limits_prune() TO service_role;

-- 3. Service calls may never hold the database for minutes.
ALTER ROLE service_role SET statement_timeout = '30s';
