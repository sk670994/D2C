BEGIN;

-- ============================================================
-- Zooptrack AdSpy persistence / conflict / tracking repair
-- ============================================================

-- Supabase/PostgREST upsert() uses plain conflict targets:
--   (platform, external_ad_key)
--   (creative_id, geography_id)
--
-- Partial unique indexes cannot be inferred by a plain
-- ON CONFLICT target. Replace the old partial indexes.
DROP INDEX IF EXISTS
  public.ad_intelligence_creatives_external_key_uidx;

DROP INDEX IF EXISTS
  public.ad_intelligence_creatives_platform_external_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_creatives_platform_external_key_uidx
ON public.ad_intelligence_creatives (
  platform,
  external_ad_key
);

DROP INDEX IF EXISTS
  public.ad_intelligence_markets_creative_geography_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_markets_creative_geography_uidx
ON public.ad_intelligence_markets (
  creative_id,
  geography_id
);

-- These indexes support the actual product paths.
CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_last_seen_idx
ON public.ad_intelligence_creatives (
  platform,
  is_currently_active,
  last_seen_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_creator_idx
ON public.ad_intelligence_creatives (
  platform,
  creator_name
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_offer_idx
ON public.ad_intelligence_creatives (
  platform,
  offer
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_markets_country_creative_idx
ON public.ad_intelligence_markets (
  country,
  creative_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_observations_creative_day_idx
ON public.ad_intelligence_observations (
  creative_id,
  observation_day DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_tracked_brands_due_idx
ON public.ad_intelligence_tracked_brands (
  active,
  last_collected_at
);

-- Keep tracked search/job records private by user where applicable.
ALTER TABLE public.ad_intelligence_tracked_brands
  ADD COLUMN IF NOT EXISTS refresh_hours INTEGER NOT NULL DEFAULT 24;

ALTER TABLE public.ad_intelligence_tracked_brands
  ADD COLUMN IF NOT EXISTS last_collected_at TIMESTAMPTZ;

ALTER TABLE public.ad_intelligence_collection_jobs
  ADD COLUMN IF NOT EXISTS dispatch_claimed_at TIMESTAMPTZ;

COMMIT;
