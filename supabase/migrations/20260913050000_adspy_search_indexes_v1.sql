BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Exact advertiser lookup.
CREATE INDEX IF NOT EXISTS
  idx_adspy_creatives_platform_advertiser_active_seen
ON public.ad_intelligence_creatives (
  platform,
  advertiser_id,
  is_currently_active DESC,
  last_seen_at DESC,
  id
);

-- Fast country -> creative existence checks.
CREATE INDEX IF NOT EXISTS
  idx_adspy_markets_country_creative
ON public.ad_intelligence_markets (
  country,
  creative_id
);

-- Fast per-creative country enrichment.
CREATE INDEX IF NOT EXISTS
  idx_adspy_markets_creative_country
ON public.ad_intelligence_markets (
  creative_id,
  country
);

-- Fast language enrichment.
CREATE INDEX IF NOT EXISTS
  idx_adspy_languages_creative
ON public.ad_intelligence_languages (
  creative_id,
  id
);

-- Fast advertiser-name matching.
CREATE INDEX IF NOT EXISTS
  idx_adspy_creatives_advertiser_name_trgm
ON public.ad_intelligence_creatives
USING gin (
  lower(advertiser_name)
  gin_trgm_ops
);

-- Fast keyword matching.
CREATE INDEX IF NOT EXISTS
  idx_adspy_creatives_creator_name_trgm
ON public.ad_intelligence_creatives
USING gin (
  lower(creator_name)
  gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS
  idx_adspy_creatives_headline_trgm
ON public.ad_intelligence_creatives
USING gin (
  lower(headline)
  gin_trgm_ops
);

COMMIT;