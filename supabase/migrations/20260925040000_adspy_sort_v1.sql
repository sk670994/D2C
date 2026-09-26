-- AdSpy real server-side sorting (v1)
--
-- Adds adspy_search_creatives_v5 = adspy_search_creatives_v4 + p_sort.
-- Bodies are copied from 20260925020000_adspy_search_hot_path_v5.sql; only the
-- ORDER BY changes. v4 is left untouched, so the deployed app keeps working
-- and rollback is: DROP FUNCTION the three *_v5 functions.
--
-- Sort keys (whitelisted in the dispatcher, default 'relevant'):
--   relevant  active first, most recently seen first (previous behaviour)
--   newest    ad start date (first_seen_at) newest first
--   longest   observed running days, longest first
--   stopped   inactive ads first, most recently stopped first
-- "longest" means observed longevity, not profitability.

BEGIN;

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
  COUNT(*) OVER () AS total_count,
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

CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v5_generic(
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
    AND (
      n.page_id_value = ''
      OR trim(COALESCE(c.advertiser_id, '')) = n.page_id_value
    )
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
  COUNT(*) OVER () AS total_count,
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

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v5_generic(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v5_generic(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v5(
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
RETURNS TABLE (total_count BIGINT, creative JSONB, markets JSONB, languages JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF trim(COALESCE(p_advertiser_page_id, '')) <> '' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v5_page(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, trim(p_advertiser_page_id),
      p_language, p_region, p_creative_type, p_active_status,
      CASE WHEN lower(trim(COALESCE(p_sort, ''))) IN ('newest','longest','stopped') THEN lower(trim(p_sort)) ELSE 'relevant' END);
  ELSE
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v5_generic(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, p_advertiser_page_id,
      p_language, p_region, p_creative_type, p_active_status,
      CASE WHEN lower(trim(COALESCE(p_sort, ''))) IN ('newest','longest','stopped') THEN lower(trim(p_sort)) ELSE 'relevant' END);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v5(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v5(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260925040000', 'adspy_sort_v1')
ON CONFLICT DO NOTHING;

COMMIT;
