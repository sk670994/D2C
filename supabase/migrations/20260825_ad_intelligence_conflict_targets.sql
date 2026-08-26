BEGIN;

-- ============================================================
-- Ad Intelligence conflict-target repair
-- ============================================================
--
-- Application uses:
--
--   ON CONFLICT (platform, external_ad_key)
--   ON CONFLICT (creative_id, geography_id)
--
-- These must be backed by non-partial unique indexes for
-- PostgREST/Supabase upsert conflict inference.
--
-- ============================================================


-- ------------------------------------------------------------
-- CREATIVES
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- MARKETS
-- ------------------------------------------------------------

DROP INDEX IF EXISTS
  public.ad_intelligence_markets_creative_geography_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_markets_creative_geography_uidx
ON public.ad_intelligence_markets (
  creative_id,
  geography_id
);


-- ------------------------------------------------------------
-- ANALYZE
-- ------------------------------------------------------------

ANALYZE public.ad_intelligence_creatives;
ANALYZE public.ad_intelligence_markets;

COMMIT;