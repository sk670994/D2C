BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.ad_intelligence_geographies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_key TEXT NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT,
  state_code TEXT,
  state_name TEXT,
  city_code TEXT,
  city_name TEXT,
  region_name TEXT,
  source TEXT NOT NULL DEFAULT 'provider'
    CHECK (source IN ('provider', 'heuristic', 'derived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_intelligence_geographies
  ADD COLUMN IF NOT EXISTS geography_key TEXT,
  ADD COLUMN IF NOT EXISTS country_name TEXT,
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS state_name TEXT,
  ADD COLUMN IF NOT EXISTS city_code TEXT,
  ADD COLUMN IF NOT EXISTS city_name TEXT,
  ADD COLUMN IF NOT EXISTS region_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'provider';

UPDATE public.ad_intelligence_geographies
SET geography_key = COALESCE(geography_key, concat_ws('|', country_code, COALESCE(state_code, ''), COALESCE(state_name, ''), COALESCE(city_code, ''), COALESCE(city_name, ''), COALESCE(region_name, '')))
WHERE geography_key IS NULL;

ALTER TABLE public.ad_intelligence_geographies
  ALTER COLUMN geography_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ad_intelligence_geographies_key_uidx
  ON public.ad_intelligence_geographies(geography_key);

ALTER TABLE public.ad_intelligence_creatives
  ADD COLUMN IF NOT EXISTS external_ad_key TEXT,
  ADD COLUMN IF NOT EXISTS data_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ad_intelligence_creatives_external_key_uidx
  ON public.ad_intelligence_creatives(platform, external_ad_key)
  WHERE external_ad_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_advertiser_trgm_idx
  ON public.ad_intelligence_creatives USING gin (advertiser_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_headline_trgm_idx
  ON public.ad_intelligence_creatives USING gin (headline gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_product_trgm_idx
  ON public.ad_intelligence_creatives USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ad_intelligence_creatives_primary_text_trgm_idx
  ON public.ad_intelligence_creatives USING gin (primary_text gin_trgm_ops);

ALTER TABLE public.ad_intelligence_markets
  ADD COLUMN IF NOT EXISTS geography_id UUID REFERENCES public.ad_intelligence_geographies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS country_name TEXT,
  ADD COLUMN IF NOT EXISTS state_name TEXT,
  ADD COLUMN IF NOT EXISTS city_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC;

CREATE INDEX IF NOT EXISTS ad_intelligence_markets_geography_idx
  ON public.ad_intelligence_markets(geography_id);
CREATE INDEX IF NOT EXISTS ad_intelligence_markets_country_idx
  ON public.ad_intelligence_markets(country, is_currently_active);

DROP INDEX IF EXISTS ad_intelligence_markets_creative_geography_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS ad_intelligence_markets_creative_geography_uidx
  ON public.ad_intelligence_markets(creative_id, geography_id)
  WHERE geography_id IS NOT NULL;

ALTER TABLE public.ad_intelligence_languages
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'heuristic',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC;

ALTER TABLE public.ad_intelligence_observations
  ADD COLUMN IF NOT EXISTS observation_day DATE,
  ADD COLUMN IF NOT EXISTS observation_key TEXT;

UPDATE public.ad_intelligence_observations
SET observation_day = COALESCE(observation_day, (observed_at AT TIME ZONE 'UTC')::date),
    observation_key = COALESCE(
      observation_key,
      concat_ws('|',
        creative_id::text,
        (observed_at AT TIME ZONE 'UTC')::date::text,
        coalesce(country, ''),
        coalesce(region, ''),
        coalesce(language, ''),
        coalesce(publisher_platform, '')
      )
    );

ALTER TABLE public.ad_intelligence_observations
  ALTER COLUMN observation_day SET DEFAULT (now() AT TIME ZONE 'UTC')::date,
  ALTER COLUMN observation_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ad_intelligence_observations_key_uidx
  ON public.ad_intelligence_observations(observation_key);

CREATE INDEX IF NOT EXISTS ad_intelligence_observations_day_idx
  ON public.ad_intelligence_observations(observation_day, creative_id);

CREATE TABLE IF NOT EXISTS public.ad_intelligence_collection_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_key TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  country TEXT NOT NULL,
  platform TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'advertiser',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','scraping','normalizing','enriching','finalizing','complete','failed')),
  stage TEXT NOT NULL DEFAULT 'queued',
  discovered_ads INTEGER NOT NULL DEFAULT 0,
  normalized_ads INTEGER NOT NULL DEFAULT 0,
  persisted_ads INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatch_claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_intelligence_collection_jobs_status_idx
  ON public.ad_intelligence_collection_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ad_intelligence_collection_jobs_lookup_idx
  ON public.ad_intelligence_collection_jobs(platform, country, query, updated_at DESC);
CREATE INDEX IF NOT EXISTS ad_intelligence_collection_jobs_dispatch_idx
  ON public.ad_intelligence_collection_jobs(status, dispatch_claimed_at);

CREATE TABLE IF NOT EXISTS public.ad_intelligence_tracked_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.ad_intelligence_brands(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'IN',
  platform TEXT NOT NULL DEFAULT 'meta',
  active BOOLEAN NOT NULL DEFAULT true,
  refresh_hours INTEGER NOT NULL DEFAULT 24,
  last_collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_intelligence_tracked_brands_uidx
  ON public.ad_intelligence_tracked_brands(user_id, normalized_query, country, platform);

CREATE INDEX IF NOT EXISTS ad_intelligence_tracked_brands_active_idx
  ON public.ad_intelligence_tracked_brands(active, last_collected_at);

CREATE TABLE IF NOT EXISTS public.ad_intelligence_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  country TEXT NOT NULL,
  platform TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'advertiser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_intelligence_search_history_user_idx
  ON public.ad_intelligence_search_history(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_ad_intelligence_v2_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_intelligence_geographies_updated_at ON public.ad_intelligence_geographies;
CREATE TRIGGER ad_intelligence_geographies_updated_at
BEFORE UPDATE ON public.ad_intelligence_geographies
FOR EACH ROW EXECUTE FUNCTION public.set_ad_intelligence_v2_updated_at();

DROP TRIGGER IF EXISTS ad_intelligence_collection_jobs_updated_at ON public.ad_intelligence_collection_jobs;
CREATE TRIGGER ad_intelligence_collection_jobs_updated_at
BEFORE UPDATE ON public.ad_intelligence_collection_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_ad_intelligence_v2_updated_at();

DROP TRIGGER IF EXISTS ad_intelligence_tracked_brands_updated_at ON public.ad_intelligence_tracked_brands;
CREATE TRIGGER ad_intelligence_tracked_brands_updated_at
BEFORE UPDATE ON public.ad_intelligence_tracked_brands
FOR EACH ROW EXECUTE FUNCTION public.set_ad_intelligence_v2_updated_at();

ALTER TABLE public.ad_intelligence_geographies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_intelligence_collection_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_intelligence_tracked_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_intelligence_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_intelligence_tracked_brands_select_own ON public.ad_intelligence_tracked_brands;
CREATE POLICY ad_intelligence_tracked_brands_select_own ON public.ad_intelligence_tracked_brands
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ad_intelligence_tracked_brands_insert_own ON public.ad_intelligence_tracked_brands;
CREATE POLICY ad_intelligence_tracked_brands_insert_own ON public.ad_intelligence_tracked_brands
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ad_intelligence_tracked_brands_update_own ON public.ad_intelligence_tracked_brands;
CREATE POLICY ad_intelligence_tracked_brands_update_own ON public.ad_intelligence_tracked_brands
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ad_intelligence_tracked_brands_delete_own ON public.ad_intelligence_tracked_brands;
CREATE POLICY ad_intelligence_tracked_brands_delete_own ON public.ad_intelligence_tracked_brands
FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ad_intelligence_search_history_select_own ON public.ad_intelligence_search_history;
CREATE POLICY ad_intelligence_search_history_select_own ON public.ad_intelligence_search_history
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ad_intelligence_search_history_insert_own ON public.ad_intelligence_search_history;
CREATE POLICY ad_intelligence_search_history_insert_own ON public.ad_intelligence_search_history
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_ad_intelligence_rollup(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH matches AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = p_platform
    AND (
      c.advertiser_name ILIKE '%' || p_query || '%' OR
      COALESCE(c.creator_name, '') ILIKE '%' || p_query || '%' OR
      COALESCE(c.headline, '') ILIKE '%' || p_query || '%' OR
      COALESCE(c.product_name, '') ILIKE '%' || p_query || '%' OR
      COALESCE(c.primary_text, '') ILIKE '%' || p_query || '%'
    )
),
market_match AS (
  SELECT DISTINCT m.creative_id
  FROM public.ad_intelligence_markets m
  WHERE m.country = p_country
),
filtered AS (
  SELECT m.*
  FROM matches m
  WHERE p_country = ''
     OR EXISTS (SELECT 1 FROM market_match mm WHERE mm.creative_id = m.id)
     OR lower(COALESCE(m.metadata ->> 'country', '')) = lower(p_country)
),
languages AS (
  SELECT
    l.language_code AS code,
    COALESCE(l.language_name, l.language_code) AS name,
    COUNT(DISTINCT l.creative_id) AS count,
    BOOL_AND(COALESCE(l.source, 'heuristic') = 'provider') AS provider_only
  FROM public.ad_intelligence_languages l
  JOIN filtered f ON f.id = l.creative_id
  GROUP BY l.language_code, l.language_name
  ORDER BY count DESC
  LIMIT 20
),
markets AS (
  SELECT
    m.country,
    MAX(m.country_name) AS country_name,
    MAX(m.state_name) AS state_name,
    MAX(m.city_name) AS city_name,
    MAX(m.region) AS region_name,
    COUNT(DISTINCT m.creative_id) AS count,
    BOOL_AND(COALESCE(m.source, 'provider') = 'provider') AS provider_only
  FROM public.ad_intelligence_markets m
  JOIN filtered f ON f.id = m.creative_id
  GROUP BY m.country, m.state_name, m.city_name, m.region
  ORDER BY count DESC
  LIMIT 100
)
SELECT jsonb_build_object(
  'totalAds', (SELECT COUNT(*) FROM filtered),
  'activeAds', (SELECT COUNT(*) FROM filtered WHERE is_currently_active = true),
  'inactiveAds', (SELECT COUNT(*) FROM filtered WHERE is_currently_active = false),
  'videoAds', (SELECT COUNT(*) FROM filtered WHERE creative_type = 'video'),
  'imageAds', (SELECT COUNT(*) FROM filtered WHERE creative_type = 'image'),
  'carouselAds', (SELECT COUNT(*) FROM filtered WHERE creative_type = 'carousel'),
  'creatorAds', (SELECT COUNT(*) FROM filtered WHERE creator_name IS NOT NULL AND trim(creator_name) <> ''),
  'averageRunningDays', COALESCE((SELECT ROUND(AVG(GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(last_seen_at, now()) - first_seen_at))/86400 + 1)))::int FROM filtered WHERE first_seen_at IS NOT NULL), 0),
  'longestRunningDays', COALESCE((SELECT MAX(GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(last_seen_at, now()) - first_seen_at))/86400 + 1))::int FROM filtered WHERE first_seen_at IS NOT NULL), 0),
  'languages', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'count', count, 'share', CASE WHEN (SELECT COUNT(*) FROM filtered) = 0 THEN 0 ELSE ROUND((count::numeric / (SELECT COUNT(*) FROM filtered)) * 100)::int END, 'source', CASE WHEN provider_only THEN 'provider' ELSE 'heuristic' END)) FROM languages), '[]'::jsonb),
  'markets', COALESCE((SELECT jsonb_agg(jsonb_build_object('countryCode', country, 'countryName', country_name, 'stateName', state_name, 'cityName', city_name, 'regionName', region_name, 'count', count, 'share', CASE WHEN (SELECT COUNT(*) FROM filtered) = 0 THEN 0 ELSE ROUND((count::numeric / (SELECT COUNT(*) FROM filtered)) * 100)::int END, 'source', CASE WHEN provider_only THEN 'provider' ELSE 'derived' END)) FROM markets), '[]'::jsonb)
);
$$;

COMMIT;
