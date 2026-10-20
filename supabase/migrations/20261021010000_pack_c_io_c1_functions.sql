-- Pack C / c1: cut database IO — functions, trigger, one metadata-only column.
-- Lossless. Transactional: run this whole file in one go (SQL editor) BEFORE
-- deploying the Pack C app code. Then run the c2 file statement by statement.
--
-- What it does and why (Supabase Free nano, weak disk IO, 19 Oct 2026):
--
-- 1) Version trigger adspy_capture_creative_version: on UPDATE it now returns
--    early when the content hash of OLD and NEW is the same and
--    is_currently_active did not change. Before, every changed-path upsert
--    (PostgREST sets every column) fired the trigger and ran an
--    INSERT .. ON CONFLICT DO UPDATE on ad_intelligence_creative_versions
--    (~100 MB) that only bumped seen_count/last_observed_at: one dead tuple
--    plus index writes per ad per save.
--    The trigger's UPDATE OF column list is trimmed to the columns the hash
--    reads plus is_currently_active, so media/identity/metadata-only updates
--    (media backfill, slim scripts, advertiser_id repair) never fire it.
--
--    HASH DECISION: adspy_creative_content_hash is NOT changed. Its latest
--    definition (20260925050000, "v2") already ignores metadata, all media
--    URLs (image/video/thumbnail), source_url and advertiser/creator identity:
--    it hashes only creative_type, primary_text, headline, description,
--    call_to_action, landing page (no query string), product_name, prices,
--    currency, offer, video duration and transcript. Every stored
--    content_hash was computed by this same function, so a new hash would
--    have mismatched every existing version row and created one new version
--    per ad on the next scrape. Keeping it means zero version burst.
--    Side effect (accepted): last_observed_at / seen_count of a version are
--    no longer bumped by a no-op re-save. They were already not bumped by the
--    nightly "seen again" path (12 Oct), so they meant "last write", not
--    "last seen"; Today reads first_observed_at only.
--
-- 2) adspy_search_facets is read-only and STABLE: when a summary row exists
--    it is returned whatever its age; when missing, facets are computed from
--    the same ids via adspy_facets_for_ids WITHOUT writing a summary. Search
--    used to upsert adspy_advertiser_summaries on every request older than
--    6 h (a write inside a read). The collector now refreshes the summary of
--    every page it touched (Pack C app code), so summaries stay current.
--
-- 3) adspy_search_creatives_v4_page / _v5_page return NULL::bigint as
--    total_count instead of COUNT(*) OVER (). The window count made Postgres
--    materialise every matching row (to_jsonb + markets/languages
--    sub-selects) before LIMIT. lib/ad-intelligence/global/accurate-search.ts
--    already falls back to adspy_search_metrics_v2.total_ads (same filters,
--    always fetched in parallel) when total_count is 0/NULL. Same rows, same
--    order; only the per-row total changes from N to NULL.
--
-- 4) ad_intelligence_creatives.media_state text (NULL = not tried,
--    'stored', 'dead'). ADD COLUMN without default is metadata-only (no
--    table rewrite); the CHECK is NOT VALID (no scan; enforced for new
--    writes; every existing row is NULL anyway). A small BEFORE UPDATE
--    trigger re-opens a 'dead' ad when a later collection brings a new
--    image link. Media backfill reads only media_state IS NULL rows through
--    the partial index created in c2.
--
-- Same signatures, volatility (except facets: VOLATILE -> STABLE),
-- search_path and grants as the source definitions. Safe to re-run.
--
-- Rollback:
--   * trigger/function: re-run 20261014010000_versions_no_metadata_v1.sql and
--     20261012010000_version_trigger_content_only_v1.sql.
--   * facets: re-run the adspy_search_facets block of
--     20261020010000_search_name_trgm_v1.sql.
--   * page search: re-run the v4_page block of 20260925020000 and the
--     v5_page block of 20260925040000.
--   * media_state: DROP TRIGGER adspy_media_state_reopen ON
--     public.ad_intelligence_creatives; DROP FUNCTION
--     public.adspy_media_state_reopen(); ALTER TABLE
--     public.ad_intelligence_creatives DROP COLUMN media_state; (metadata-only)

BEGIN;

-- Never queue behind a long lock on the big tables: fail fast and retry.
SET LOCAL lock_timeout = '5s';

-- 1) Version trigger -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adspy_capture_creative_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  version_hash TEXT;
  observed_at_value TIMESTAMPTZ;
BEGIN
  version_hash := public.adspy_creative_content_hash(
    NEW.advertiser_name,
    NEW.advertiser_id,
    NEW.creator_name,
    NEW.partnership_type,
    NEW.creative_type,
    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,
    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,
    NEW.landing_page_url,
    NEW.source_url,
    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,
    NEW.offer,
    NEW.transcript,
    NEW.transcript_status,
    NEW.metadata
  );

  -- Pack C: a re-save that changes neither the content nor the live status
  -- writes nothing to the versions table.
  IF TG_OP = 'UPDATE'
     AND OLD.is_currently_active IS NOT DISTINCT FROM NEW.is_currently_active
     AND version_hash = public.adspy_creative_content_hash(
       OLD.advertiser_name,
       OLD.advertiser_id,
       OLD.creator_name,
       OLD.partnership_type,
       OLD.creative_type,
       OLD.image_url,
       OLD.video_url,
       OLD.thumbnail_url,
       OLD.video_duration_seconds,
       OLD.primary_text,
       OLD.headline,
       OLD.description,
       OLD.call_to_action,
       OLD.landing_page_url,
       OLD.source_url,
       OLD.product_name,
       OLD.product_price,
       OLD.max_price,
       OLD.currency,
       OLD.offer,
       OLD.transcript,
       OLD.transcript_status,
       OLD.metadata
     ) THEN
    RETURN NEW;
  END IF;

  observed_at_value :=
    COALESCE(
      NEW.last_seen_at,
      NEW.updated_at,
      now()
    );

  INSERT INTO public.ad_intelligence_creative_versions (
    creative_id,
    content_hash,

    advertiser_name,
    advertiser_id,

    creator_name,
    partnership_type,

    creative_type,

    image_url,
    video_url,
    thumbnail_url,
    video_duration_seconds,

    primary_text,
    headline,
    description,
    call_to_action,

    landing_page_url,
    source_url,

    product_name,
    product_price,
    max_price,
    currency,

    offer,

    transcript,
    transcript_status,

    metadata,

    is_currently_active,

    first_observed_at,
    last_observed_at,
    seen_count
  )
  VALUES (
    NEW.id,
    version_hash,

    NEW.advertiser_name,
    NEW.advertiser_id,

    NEW.creator_name,
    NEW.partnership_type,

    NEW.creative_type,

    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,

    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,

    NEW.landing_page_url,
    NEW.source_url,

    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,

    NEW.offer,

    NEW.transcript,
    NEW.transcript_status,

    '{}'::jsonb, -- not read anywhere (20261014010000)

    NEW.is_currently_active,

    observed_at_value,
    observed_at_value,
    1
  )
  ON CONFLICT (
    creative_id,
    content_hash
  )
  DO UPDATE
  SET
    last_observed_at =
      GREATEST(
        public.ad_intelligence_creative_versions.last_observed_at,
        EXCLUDED.last_observed_at
      ),

    is_currently_active =
      EXCLUDED.is_currently_active,

    seen_count =
      public.ad_intelligence_creative_versions.seen_count + 1;

  RETURN NEW;
END;
$$;

-- Only the columns the content hash reads, plus the live status. (Media URLs,
-- source_url, metadata, advertiser/creator identity and transcript_status are
-- not hashed: an update of only those can never produce a new version.)
DROP TRIGGER IF EXISTS adspy_creative_version_capture ON public.ad_intelligence_creatives;

CREATE TRIGGER adspy_creative_version_capture
AFTER INSERT OR UPDATE OF
  creative_type, video_duration_seconds, primary_text, headline, description,
  call_to_action, landing_page_url, product_name, product_price, max_price,
  currency, offer, transcript, is_currently_active
ON public.ad_intelligence_creatives
FOR EACH ROW
EXECUTE FUNCTION public.adspy_capture_creative_version();


-- 2) Read-only facets -------------------------------------------------------------
-- Copied from 20261020010000 (pack A); only the summary branch changed.
CREATE OR REPLACE FUNCTION public.adspy_search_facets(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_advertiser_page_id TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_creative_type TEXT DEFAULT NULL,
  p_active_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_platform TEXT := lower(trim(COALESCE(p_platform, 'meta')));
  v_country  TEXT := upper(trim(COALESCE(p_country, 'IN')));
  v_page     TEXT := trim(COALESCE(p_advertiser_page_id, ''));
  v_query    TEXT := lower(trim(COALESCE(p_query, '')));
  v_mode     TEXT := lower(trim(COALESCE(p_mode, 'advertiser')));
  v_filtered BOOLEAN := COALESCE(trim(p_language), '') <> '' OR COALESCE(trim(p_region), '') <> ''
                     OR COALESCE(trim(p_creative_type), '') <> '' OR COALESCE(trim(p_active_status), '') <> '';
  v_facets   JSONB;
  v_ids      UUID[];
BEGIN
  IF v_page <> '' THEN
    IF NOT v_filtered THEN
      -- Any age: the collector refreshes it after every collection of the page.
      SELECT s.facets INTO v_facets FROM public.adspy_advertiser_summaries s
      WHERE s.platform = v_platform AND s.advertiser_id = v_page AND s.country = v_country;
      IF FOUND THEN
        RETURN v_facets;
      END IF;
      -- Missing: compute below from the page's ids (no write).
    END IF;

    SELECT COALESCE(array_agg(c.id), '{}') INTO v_ids
    FROM public.ad_intelligence_creatives c
    WHERE c.platform = v_platform
      AND c.advertiser_id = v_page
      AND EXISTS (SELECT 1 FROM public.ad_intelligence_markets m WHERE m.creative_id = c.id AND m.country = v_country);
  ELSIF v_query = '' THEN
    v_ids := '{}';
  ELSIF v_mode = 'keyword' THEN
    SELECT COALESCE(array_agg(c.id), '{}') INTO v_ids
    FROM public.ad_intelligence_creatives c
    WHERE c.platform = v_platform
      AND EXISTS (SELECT 1 FROM public.ad_intelligence_markets m WHERE m.creative_id = c.id AND m.country = v_country)
      AND (strpos(lower(COALESCE(c.advertiser_name, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.creator_name, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.headline, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.product_name, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.primary_text, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.description, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.offer, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.call_to_action, '')), v_query) > 0
        OR strpos(lower(COALESCE(c.landing_page_url, '')), v_query) > 0);
  ELSE
    SELECT COALESCE(array_agg(c.id), '{}') INTO v_ids
    FROM public.ad_intelligence_creatives c
    WHERE c.platform = v_platform
      AND EXISTS (SELECT 1 FROM public.ad_intelligence_markets m WHERE m.creative_id = c.id AND m.country = v_country)
      AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN public.adspy_facets_for_ids(v_ids, v_country, p_language, p_region, p_creative_type, p_active_status);
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_facets(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_facets(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;


-- 3) Page search without the window count ------------------------------------------
-- Bodies copied verbatim from 20260925020000 (v4_page) and 20260925040000
-- (v5_page); only the total_count expression changed.
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v4_page(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 36,
  p_advertiser_page_id TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_creative_type TEXT DEFAULT NULL,
  p_active_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  creative JSONB,
  markets JSONB,
  languages JSONB
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    lower(trim(COALESCE(p_query, ''))) AS query_value,
    upper(trim(COALESCE(p_country, 'IN'))) AS country_value,
    lower(trim(COALESCE(p_platform, 'meta'))) AS platform_value,
    lower(trim(COALESCE(p_mode, 'advertiser'))) AS mode_value,
    trim(COALESCE(p_advertiser_page_id, '')) AS page_id_value,
    lower(trim(COALESCE(p_language, ''))) AS language_value,
    lower(trim(COALESCE(p_region, ''))) AS region_value,
    lower(trim(COALESCE(p_creative_type, ''))) AS creative_type_value,
    lower(trim(COALESCE(p_active_status, ''))) AS active_status_value
),
filtered AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  CROSS JOIN normalized n
  WHERE c.platform = n.platform_value
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND m.country = n.country_value
        AND (
          n.region_value = ''
          OR lower(COALESCE(m.region, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.state_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.city_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.country_name, '')) ILIKE '%' || n.region_value || '%'
        )
    )
    AND c.advertiser_id = n.page_id_value
    AND (
      n.language_value = ''
      OR EXISTS (
        SELECT 1
        FROM public.ad_intelligence_languages l
        WHERE l.creative_id = c.id
          AND (
            lower(trim(l.language_code)) = n.language_value
            OR lower(trim(COALESCE(l.language_name, ''))) = n.language_value
          )
      )
    )
    AND (
      n.creative_type_value = ''
      OR lower(COALESCE(c.creative_type, '')) = n.creative_type_value
    )
    AND (
      n.active_status_value = ''
      OR (n.active_status_value = 'active' AND c.is_currently_active = TRUE)
      OR (n.active_status_value = 'inactive' AND c.is_currently_active = FALSE)
    )
    AND (
      n.page_id_value <> ''
      OR (
        (n.mode_value = 'advertiser'
         AND strpos(lower(COALESCE(c.advertiser_name, '')), n.query_value) > 0)
        OR
        (n.mode_value = 'keyword'
         AND (
           strpos(lower(COALESCE(c.advertiser_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.creator_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.headline, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.product_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.primary_text, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.description, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.offer, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.call_to_action, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.landing_page_url, '')), n.query_value) > 0
         ))
      )
    )
)
SELECT
  -- Pack C: no COUNT(*) OVER (). The window count forced Postgres to build
  -- every matching row (to_jsonb + markets + languages sub-selects) before
  -- LIMIT. The app takes the total from adspy_search_metrics_v2.total_ads
  -- (same filters) whenever total_count is NULL/0 (accurate-search.ts).
  NULL::BIGINT AS total_count,
  to_jsonb(c) AS creative,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
      FROM public.ad_intelligence_markets m
      CROSS JOIN normalized n
      WHERE m.creative_id = c.id
        AND m.country = n.country_value
        AND (
          n.region_value = ''
          OR lower(COALESCE(m.region, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.state_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.city_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.country_name, '')) ILIKE '%' || n.region_value || '%'
        )
    ),
    '[]'::jsonb
  ) AS markets,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM public.ad_intelligence_languages l
      WHERE l.creative_id = c.id
        AND (
          n.language_value = ''
          OR lower(trim(l.language_code)) = n.language_value
          OR lower(trim(COALESCE(l.language_name, ''))) = n.language_value
        )
    ),
    '[]'::jsonb
  ) AS languages
FROM filtered c
CROSS JOIN normalized n
ORDER BY
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 36)))
OFFSET (
  GREATEST(1, COALESCE(p_page, 1)) - 1
) * LEAST(60, GREATEST(1, COALESCE(p_limit, 36)));
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v4_page(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v4_page(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v5_page(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 36,
  p_advertiser_page_id TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_creative_type TEXT DEFAULT NULL,
  p_active_status TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  creative JSONB,
  markets JSONB,
  languages JSONB
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    lower(trim(COALESCE(p_query, ''))) AS query_value,
    upper(trim(COALESCE(p_country, 'IN'))) AS country_value,
    lower(trim(COALESCE(p_platform, 'meta'))) AS platform_value,
    lower(trim(COALESCE(p_mode, 'advertiser'))) AS mode_value,
    trim(COALESCE(p_advertiser_page_id, '')) AS page_id_value,
    lower(trim(COALESCE(p_language, ''))) AS language_value,
    lower(trim(COALESCE(p_region, ''))) AS region_value,
    lower(trim(COALESCE(p_creative_type, ''))) AS creative_type_value,
    lower(trim(COALESCE(p_active_status, ''))) AS active_status_value,
    lower(trim(COALESCE(p_sort, ''))) AS sort_value
),
filtered AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  CROSS JOIN normalized n
  WHERE c.platform = n.platform_value
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND m.country = n.country_value
        AND (
          n.region_value = ''
          OR lower(COALESCE(m.region, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.state_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.city_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.country_name, '')) ILIKE '%' || n.region_value || '%'
        )
    )
    AND c.advertiser_id = n.page_id_value
    AND (
      n.language_value = ''
      OR EXISTS (
        SELECT 1
        FROM public.ad_intelligence_languages l
        WHERE l.creative_id = c.id
          AND (
            lower(trim(l.language_code)) = n.language_value
            OR lower(trim(COALESCE(l.language_name, ''))) = n.language_value
          )
      )
    )
    AND (
      n.creative_type_value = ''
      OR lower(COALESCE(c.creative_type, '')) = n.creative_type_value
    )
    AND (
      n.active_status_value = ''
      OR (n.active_status_value = 'active' AND c.is_currently_active = TRUE)
      OR (n.active_status_value = 'inactive' AND c.is_currently_active = FALSE)
    )
    AND (
      n.page_id_value <> ''
      OR (
        (n.mode_value = 'advertiser'
         AND strpos(lower(COALESCE(c.advertiser_name, '')), n.query_value) > 0)
        OR
        (n.mode_value = 'keyword'
         AND (
           strpos(lower(COALESCE(c.advertiser_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.creator_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.headline, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.product_name, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.primary_text, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.description, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.offer, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.call_to_action, '')), n.query_value) > 0
           OR strpos(lower(COALESCE(c.landing_page_url, '')), n.query_value) > 0
         ))
      )
    )
)
SELECT
  -- Pack C: no COUNT(*) OVER (). The window count forced Postgres to build
  -- every matching row (to_jsonb + markets + languages sub-selects) before
  -- LIMIT. The app takes the total from adspy_search_metrics_v2.total_ads
  -- (same filters) whenever total_count is NULL/0 (accurate-search.ts).
  NULL::BIGINT AS total_count,
  to_jsonb(c) AS creative,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
      FROM public.ad_intelligence_markets m
      CROSS JOIN normalized n
      WHERE m.creative_id = c.id
        AND m.country = n.country_value
        AND (
          n.region_value = ''
          OR lower(COALESCE(m.region, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.state_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.city_name, '')) ILIKE '%' || n.region_value || '%'
          OR lower(COALESCE(m.country_name, '')) ILIKE '%' || n.region_value || '%'
        )
    ),
    '[]'::jsonb
  ) AS markets,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM public.ad_intelligence_languages l
      WHERE l.creative_id = c.id
        AND (
          n.language_value = ''
          OR lower(trim(l.language_code)) = n.language_value
          OR lower(trim(COALESCE(l.language_name, ''))) = n.language_value
        )
    ),
    '[]'::jsonb
  ) AS languages
FROM filtered c
CROSS JOIN normalized n
ORDER BY
  -- p_sort is whitelisted in adspy_search_creatives_v5; anything else = relevant.
  CASE WHEN n.sort_value = 'newest' THEN c.first_seen_at END DESC NULLS LAST,
  CASE WHEN n.sort_value = 'longest' THEN
    (COALESCE(CASE WHEN c.is_currently_active THEN now() ELSE c.last_seen_at END, now())::date
      - c.first_seen_at::date)
  END DESC NULLS LAST,
  CASE WHEN n.sort_value = 'stopped' THEN (NOT COALESCE(c.is_currently_active, TRUE)) END DESC NULLS LAST,
  CASE WHEN n.sort_value = 'stopped' THEN c.last_seen_at END DESC NULLS LAST,
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 36)))
OFFSET (
  GREATEST(1, COALESCE(p_page, 1)) - 1
) * LEAST(60, GREATEST(1, COALESCE(p_limit, 36)));
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v5_page(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v5_page(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- 4) Media state ------------------------------------------------------------------
-- Metadata-only on PG11+: no default, so no table rewrite.
ALTER TABLE public.ad_intelligence_creatives
  ADD COLUMN IF NOT EXISTS media_state TEXT;

COMMENT ON COLUMN public.ad_intelligence_creatives.media_state IS
  'Media backfill: NULL = not tried yet, stored = image copied to our storage, dead = Meta link gone (one failed fetch). Reset to NULL when a new link arrives.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_intelligence_creatives_media_state_check'
      AND conrelid = 'public.ad_intelligence_creatives'::regclass
  ) THEN
    -- NOT VALID: no scan of the table; still enforced for every new write.
    ALTER TABLE public.ad_intelligence_creatives
      ADD CONSTRAINT ad_intelligence_creatives_media_state_check
      CHECK (media_state IS NULL OR media_state IN ('pending', 'stored', 'dead')) NOT VALID;
  END IF;
END $$;

-- A 'dead' ad that a later collection saves with a NEW image link is tried
-- again (the app never writes media_state on collection, so both OLD and NEW
-- say 'dead' here; the backfill's own "stored"/"dead" writes are left alone).
CREATE OR REPLACE FUNCTION public.adspy_media_state_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.media_state := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_media_state_reopen() FROM PUBLIC;

DROP TRIGGER IF EXISTS adspy_media_state_reopen ON public.ad_intelligence_creatives;
CREATE TRIGGER adspy_media_state_reopen
BEFORE UPDATE OF thumbnail_url, image_url ON public.ad_intelligence_creatives
FOR EACH ROW
WHEN (
  OLD.media_state = 'dead'
  AND NEW.media_state = 'dead'
  AND (NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
       OR NEW.image_url IS DISTINCT FROM OLD.image_url)
)
EXECUTE FUNCTION public.adspy_media_state_reopen();

COMMIT;

-- Verify (read-only):
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid = 'public.ad_intelligence_creatives'::regclass AND NOT tgisinternal;
--   SELECT provolatile FROM pg_proc WHERE proname = 'adspy_search_facets';   -- expect 's'
--   SELECT count(*) FILTER (WHERE total_count IS NULL), count(*)
--   FROM public.adspy_search_creatives_v5('', 'IN', 'meta', 'advertiser', 1, 36, '<a page id>');
