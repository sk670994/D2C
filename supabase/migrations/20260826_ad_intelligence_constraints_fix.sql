BEGIN;

-- ============================================================
-- Ad Intelligence constraint repair
--
-- The application uses:
--
--   ON CONFLICT (platform, external_ad_key)
--   ON CONFLICT (creative_id, geography_id)
--
-- The previous indexes were PARTIAL unique indexes.
-- PostgreSQL cannot infer those partial indexes from the
-- conflict targets above without a matching WHERE predicate.
--
-- Supabase/PostgREST upsert is therefore failing with:
--
-- "there is no unique or exclusion constraint matching
--  the ON CONFLICT specification"
--
-- Replace the partial indexes with normal unique indexes.
--
-- PostgreSQL allows multiple NULL values in a normal UNIQUE
-- index, so old rows with NULL keys remain valid.
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


COMMIT;