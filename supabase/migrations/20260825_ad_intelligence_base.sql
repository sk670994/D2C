BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. BRANDS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  canonical_name TEXT NOT NULL,

  normalized_name TEXT NOT NULL UNIQUE,

  domain TEXT,

  country TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_brands_name_trgm_idx
ON public.ad_intelligence_brands
USING gin (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_brands_normalized_idx
ON public.ad_intelligence_brands (
  normalized_name
);

-- ============================================================
-- 2. BRAND ALIASES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_brand_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  brand_id UUID NOT NULL
    REFERENCES public.ad_intelligence_brands(id)
    ON DELETE CASCADE,

  alias TEXT NOT NULL,

  normalized_alias TEXT NOT NULL,

  alias_type TEXT NOT NULL DEFAULT 'advertiser',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (
    brand_id,
    normalized_alias
  )
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_brand_aliases_prefix_idx
ON public.ad_intelligence_brand_aliases (
  normalized_alias
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_brand_aliases_brand_idx
ON public.ad_intelligence_brand_aliases (
  brand_id
);

-- ============================================================
-- 3. CREATORS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  canonical_name TEXT NOT NULL,

  normalized_name TEXT NOT NULL,

  platform TEXT NOT NULL,

  external_creator_id TEXT,

  profile_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_creators_platform_name_uidx
ON public.ad_intelligence_creators (
  platform,
  normalized_name
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creators_name_trgm_idx
ON public.ad_intelligence_creators
USING gin (canonical_name gin_trgm_ops);

-- ============================================================
-- 4. CANONICAL CREATIVES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  brand_id UUID
    REFERENCES public.ad_intelligence_brands(id)
    ON DELETE SET NULL,

  platform TEXT NOT NULL,

  external_ad_id TEXT,

  external_ad_key TEXT,

  advertiser_name TEXT NOT NULL,

  advertiser_id TEXT,

  creator_name TEXT,

  partnership_type TEXT NOT NULL DEFAULT 'unknown',

  creative_type TEXT NOT NULL DEFAULT 'unknown',

  image_url TEXT,

  video_url TEXT,

  thumbnail_url TEXT,

  video_duration_seconds INTEGER,

  primary_text TEXT,

  headline TEXT,

  description TEXT,

  call_to_action TEXT,

  landing_page_url TEXT,

  source_url TEXT,

  product_name TEXT,

  product_price NUMERIC,

  max_price NUMERIC,

  currency TEXT,

  offer TEXT,

  transcript TEXT,

  transcript_status TEXT NOT NULL DEFAULT 'not_video',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  intelligence JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_seen_at TIMESTAMPTZ,

  last_seen_at TIMESTAMPTZ,

  is_currently_active BOOLEAN,

  data_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    product_price IS NULL
    OR product_price >= 0
  ),

  CHECK (
    max_price IS NULL
    OR max_price >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_creatives_platform_external_key_uidx
ON public.ad_intelligence_creatives (
  platform,
  external_ad_key
)
WHERE external_ad_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_platform_idx
ON public.ad_intelligence_creatives (
  platform
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_brand_idx
ON public.ad_intelligence_creatives (
  brand_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_active_idx
ON public.ad_intelligence_creatives (
  is_currently_active,
  last_seen_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_advertiser_trgm_idx
ON public.ad_intelligence_creatives
USING gin (advertiser_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_headline_trgm_idx
ON public.ad_intelligence_creatives
USING gin (headline gin_trgm_ops);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_product_trgm_idx
ON public.ad_intelligence_creatives
USING gin (product_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creatives_primary_text_trgm_idx
ON public.ad_intelligence_creatives
USING gin (primary_text gin_trgm_ops);

-- ============================================================
-- 5. CREATIVE <-> CREATOR RELATIONSHIP
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_creative_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creative_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creatives(id)
    ON DELETE CASCADE,

  creator_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creators(id)
    ON DELETE CASCADE,

  relationship_type TEXT NOT NULL DEFAULT 'creator',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (
    creative_id,
    creator_id
  )
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_creators_creator_idx
ON public.ad_intelligence_creative_creators (
  creator_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_creators_creative_idx
ON public.ad_intelligence_creative_creators (
  creative_id
);

-- ============================================================
-- 6. LANGUAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creative_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creatives(id)
    ON DELETE CASCADE,

  language_code TEXT NOT NULL,

  language_name TEXT,

  source TEXT NOT NULL DEFAULT 'heuristic',

  confidence NUMERIC,

  first_seen_at TIMESTAMPTZ,

  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    confidence IS NULL
    OR (
      confidence >= 0
      AND confidence <= 1
    )
  ),

  UNIQUE (
    creative_id,
    language_code
  )
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_languages_creative_idx
ON public.ad_intelligence_languages (
  creative_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_languages_code_idx
ON public.ad_intelligence_languages (
  language_code
);

-- ============================================================
-- 7. GEOGRAPHIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_geographies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  geography_key TEXT NOT NULL UNIQUE,

  country_code TEXT NOT NULL,

  country_name TEXT,

  state_code TEXT,

  state_name TEXT,

  city_code TEXT,

  city_name TEXT,

  region_name TEXT,

  source TEXT NOT NULL DEFAULT 'provider',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    source IN (
      'provider',
      'heuristic',
      'derived'
    )
  )
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_geographies_country_idx
ON public.ad_intelligence_geographies (
  country_code
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_geographies_city_idx
ON public.ad_intelligence_geographies (
  city_name
);

-- ============================================================
-- 8. MARKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creative_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creatives(id)
    ON DELETE CASCADE,

  geography_id UUID
    REFERENCES public.ad_intelligence_geographies(id)
    ON DELETE SET NULL,

  country TEXT NOT NULL,

  country_name TEXT,

  state_name TEXT,

  city_name TEXT,

  region TEXT,

  first_seen_at TIMESTAMPTZ,

  last_seen_at TIMESTAMPTZ,

  is_currently_active BOOLEAN,

  source TEXT NOT NULL DEFAULT 'provider',

  confidence NUMERIC,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    confidence IS NULL
    OR (
      confidence >= 0
      AND confidence <= 1
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_markets_creative_geography_uidx
ON public.ad_intelligence_markets (
  creative_id,
  geography_id
)
WHERE geography_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  ad_intelligence_markets_creative_idx
ON public.ad_intelligence_markets (
  creative_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_markets_country_idx
ON public.ad_intelligence_markets (
  country,
  is_currently_active
);

-- ============================================================
-- 9. OBSERVATIONS / HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creative_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creatives(id)
    ON DELETE CASCADE,

  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  observation_day DATE NOT NULL
    DEFAULT (
      (now() AT TIME ZONE 'UTC')::date
    ),

  observation_key TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'unknown',

  country TEXT,

  region TEXT,

  language TEXT,

  publisher_platform TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_observations_creative_idx
ON public.ad_intelligence_observations (
  creative_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_observations_day_idx
ON public.ad_intelligence_observations (
  observation_day,
  creative_id
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_observations_status_idx
ON public.ad_intelligence_observations (
  status,
  observation_day DESC
);

-- ============================================================
-- 10. COLLECTION JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_collection_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  collection_key TEXT NOT NULL UNIQUE,

  query TEXT NOT NULL,

  country TEXT NOT NULL,

  platform TEXT NOT NULL,

  mode TEXT NOT NULL DEFAULT 'advertiser',

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (
      status IN (
        'queued',
        'scraping',
        'normalizing',
        'enriching',
        'finalizing',
        'complete',
        'failed'
      )
    ),

  stage TEXT NOT NULL DEFAULT 'queued'
    CHECK (
      stage IN (
        'queued',
        'scraping',
        'normalizing',
        'enriching',
        'finalizing',
        'complete',
        'failed'
      )
    ),

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

CREATE INDEX IF NOT EXISTS
  ad_intelligence_collection_jobs_status_idx
ON public.ad_intelligence_collection_jobs (
  status,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_collection_jobs_lookup_idx
ON public.ad_intelligence_collection_jobs (
  platform,
  country,
  query,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_collection_jobs_dispatch_idx
ON public.ad_intelligence_collection_jobs (
  status,
  dispatch_claimed_at
);

-- ============================================================
-- 11. TRACKED BRANDS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_tracked_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  brand_id UUID
    REFERENCES public.ad_intelligence_brands(id)
    ON DELETE SET NULL,

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

CREATE UNIQUE INDEX IF NOT EXISTS
  ad_intelligence_tracked_brands_uidx
ON public.ad_intelligence_tracked_brands (
  user_id,
  normalized_query,
  country,
  platform
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_tracked_brands_active_idx
ON public.ad_intelligence_tracked_brands (
  active,
  last_collected_at
);

-- ============================================================
-- 12. SEARCH HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  query TEXT NOT NULL,

  normalized_query TEXT NOT NULL,

  country TEXT NOT NULL,

  platform TEXT NOT NULL,

  mode TEXT NOT NULL DEFAULT 'advertiser',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_search_history_user_idx
ON public.ad_intelligence_search_history (
  user_id,
  created_at DESC
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_ad_intelligence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  ad_intelligence_brands_updated_at
ON public.ad_intelligence_brands;

CREATE TRIGGER
  ad_intelligence_brands_updated_at
BEFORE UPDATE ON public.ad_intelligence_brands
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_brand_aliases_updated_at
ON public.ad_intelligence_brand_aliases;

CREATE TRIGGER
  ad_intelligence_brand_aliases_updated_at
BEFORE UPDATE ON public.ad_intelligence_brand_aliases
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_creators_updated_at
ON public.ad_intelligence_creators;

CREATE TRIGGER
  ad_intelligence_creators_updated_at
BEFORE UPDATE ON public.ad_intelligence_creators
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_creatives_updated_at
ON public.ad_intelligence_creatives;

CREATE TRIGGER
  ad_intelligence_creatives_updated_at
BEFORE UPDATE ON public.ad_intelligence_creatives
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_languages_updated_at
ON public.ad_intelligence_languages;

CREATE TRIGGER
  ad_intelligence_languages_updated_at
BEFORE UPDATE ON public.ad_intelligence_languages
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_geographies_updated_at
ON public.ad_intelligence_geographies;

CREATE TRIGGER
  ad_intelligence_geographies_updated_at
BEFORE UPDATE ON public.ad_intelligence_geographies
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

DROP TRIGGER IF EXISTS
  ad_intelligence_markets_updated_at
ON public.ad_intelligence_markets;

CREATE TRIGGER
  ad_intelligence_markets_updated_at
BEFORE UPDATE ON public.ad_intelligence_markets
FOR EACH ROW
EXECUTE FUNCTION public.set_ad_intelligence_updated_at();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.ad_intelligence_brands
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_brand_aliases
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_creators
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_creatives
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_creative_creators
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_languages
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_geographies
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_markets
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_observations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_collection_jobs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_tracked_brands
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ad_intelligence_search_history
ENABLE ROW LEVEL SECURITY;

-- Global intelligence is server-owned.
-- No browser SELECT policies are intentionally created.
--
-- Tracked brands/search history are user-owned.

DROP POLICY IF EXISTS
  ad_intelligence_tracked_brands_select_own
ON public.ad_intelligence_tracked_brands;

CREATE POLICY
  ad_intelligence_tracked_brands_select_own
ON public.ad_intelligence_tracked_brands
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS
  ad_intelligence_tracked_brands_insert_own
ON public.ad_intelligence_tracked_brands;

CREATE POLICY
  ad_intelligence_tracked_brands_insert_own
ON public.ad_intelligence_tracked_brands
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS
  ad_intelligence_tracked_brands_update_own
ON public.ad_intelligence_tracked_brands;

CREATE POLICY
  ad_intelligence_tracked_brands_update_own
ON public.ad_intelligence_tracked_brands
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS
  ad_intelligence_tracked_brands_delete_own
ON public.ad_intelligence_tracked_brands;

CREATE POLICY
  ad_intelligence_tracked_brands_delete_own
ON public.ad_intelligence_tracked_brands
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS
  ad_intelligence_search_history_select_own
ON public.ad_intelligence_search_history;

CREATE POLICY
  ad_intelligence_search_history_select_own
ON public.ad_intelligence_search_history
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS
  ad_intelligence_search_history_insert_own
ON public.ad_intelligence_search_history;

CREATE POLICY
  ad_intelligence_search_history_insert_own
ON public.ad_intelligence_search_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

COMMIT;