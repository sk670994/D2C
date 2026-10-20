-- Search name trigram v1: index-friendly brand-NAME search. Lossless.
--
-- Problem (production, 19 Oct 2026): a brand-name search ("wanderon",
-- "Deconstruct") with no Page ID ran
--     strpos(lower(COALESCE(c.advertiser_name, '')), q) > 0
-- which no index can serve, so every click seq-scanned the whole
-- ad_intelligence_creatives table (~173 MB) 4-6 times (metrics + creatives +
-- facets + retries) and hit the 25 s client abort / 30 s statement_timeout.
--
-- Change: the advertiser-name predicate becomes
--     lower(c.advertiser_name) LIKE '%' || <q with \ % _ escaped> || '%'
-- which idx_adspy_creatives_advertiser_name_trgm (GIN, lower(advertiser_name)
-- gin_trgm_ops) can serve.
--
-- Why lossless: q is already lower(trim(p_query)); escaping \ % _ makes LIKE
-- a literal substring test, i.e. exactly strpos(...) > 0. The only difference
-- is a NULL advertiser_name with an EMPTY query (strpos('', '') = 1 matched
-- every row; LIKE on NULL does not). The app never sends a name search under
-- 2 characters (route returns early; facets has its own v_query = '' branch).
-- Keyword-mode predicates are unchanged.
--
-- Why new *_name functions: inside the *_generic SQL functions the name test
-- sits in an OR with the page/keyword branches (and reads q from a CTE), so
-- the planner cannot use an index for it even as LIKE (SQL functions are
-- planned without parameter values on PG17). The dispatchers
-- (adspy_search_metrics_v2 / adspy_search_creatives_v4 / _v5) now send
-- "advertiser mode, no Page ID" to *_name copies of *_generic whose only
-- difference is that block, replaced by one top-level LIKE on the parameter.
-- The *_generic bodies get the same predicate swap (they still serve keyword
-- mode and direct calls). adspy_search_facets: same swap in its name branch,
-- which is already a top-level AND (plpgsql, so the index is usable).
-- All other text is copied verbatim from 20260925020000 (metrics_v2 /
-- creatives_v4 + _generic), 20260925040000 (creatives_v5 + _generic) and
-- 20260925030000 (adspy_search_facets): same signatures, volatility,
-- search_path and grants. CREATE OR REPLACE only: safe to re-run.
--
-- Verify (expect "Bitmap Index Scan on idx_adspy_creatives_advertiser_name_trgm",
-- no "Seq Scan on ad_intelligence_creatives"):
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.adspy_search_creatives_v4_name('deconstruct','IN','meta','advertiser',1,25,NULL,NULL,NULL,NULL,NULL);
--   -- SQL functions hide their inner plan from EXPLAIN; to see it run:
--   LOAD 'auto_explain'; SET auto_explain.log_min_duration = 0;
--   SET auto_explain.log_nested_statements = on; SET auto_explain.log_analyze = on;
--   -- then the SELECT above and read the plan in the Postgres log, or paste the
--   -- function body with the literal arguments into EXPLAIN directly.
-- Same rows check (must return identical counts):
--   SELECT (SELECT total_ads FROM public.adspy_search_metrics_v2('deconstruct','IN','meta','advertiser')),
--          (SELECT count(*) FROM public.ad_intelligence_creatives c
--             WHERE c.platform = 'meta'
--               AND strpos(lower(COALESCE(c.advertiser_name, '')), 'deconstruct') > 0
--               AND EXISTS (SELECT 1 FROM public.ad_intelligence_markets m WHERE m.creative_id = c.id AND m.country = 'IN'));
--
-- Rollback: re-run the CREATE OR REPLACE blocks of the three source migrations
-- above, then DROP FUNCTION the three *_name functions.

BEGIN;

-- adspy_search_metrics_v2_generic: advertiser-name predicate only (keyword branch unchanged).
CREATE OR REPLACE FUNCTION public.adspy_search_metrics_v2_generic(
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
RETURNS TABLE (
  total_ads BIGINT,
  active_ads BIGINT,
  inactive_ads BIGINT,
  unknown_ads BIGINT,
  video_ads BIGINT,
  image_ads BIGINT,
  carousel_ads BIGINT,
  creator_ads BIGINT,
  average_running_days NUMERIC,
  longest_running_days INTEGER,
  last_observed_at TIMESTAMPTZ,
  top_creators JSONB,
  top_offers JSONB,
  top_hooks JSONB
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
         AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(n.query_value, '\', '\\'), '%', '\%'), '_', '\_') || '%')
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
),
with_running_days AS (
  SELECT
    f.*,
    CASE
      WHEN f.first_seen_at IS NULL THEN NULL
      ELSE GREATEST(
        1,
        FLOOR(
          EXTRACT(
            EPOCH FROM (
              COALESCE(f.last_seen_at, NOW()) - f.first_seen_at
            )
          ) / 86400
        )::INTEGER + 1
      )
    END AS running_days
  FROM filtered f
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS total_ads,
    COUNT(*) FILTER (WHERE is_currently_active = TRUE)::BIGINT AS active_ads,
    COUNT(*) FILTER (WHERE is_currently_active = FALSE)::BIGINT AS inactive_ads,
    COUNT(*) FILTER (WHERE is_currently_active IS NULL)::BIGINT AS unknown_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'video')::BIGINT AS video_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'image')::BIGINT AS image_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'carousel')::BIGINT AS carousel_ads,
    COUNT(*) FILTER (WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL)::BIGINT AS creator_ads,
    ROUND(AVG(running_days) FILTER (WHERE running_days IS NOT NULL), 0)::NUMERIC AS average_running_days,
    MAX(running_days)::INTEGER AS longest_running_days,
    GREATEST(MAX(last_seen_at), MAX(updated_at), MAX(first_seen_at)) AS last_observed_at
  FROM with_running_days
),
creator_counts AS (
  SELECT trim(creator_name) AS label, COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
  GROUP BY trim(creator_name)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
offer_counts AS (
  SELECT trim(offer) AS label, COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(offer, '')), '') IS NOT NULL
  GROUP BY trim(offer)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
hook_source AS (
  SELECT trim(substring(COALESCE(NULLIF(primary_text, ''), headline, '') FROM '^[^.!?]+')) AS label
  FROM with_running_days
),
hook_counts AS (
  SELECT left(label, 90) AS label, COUNT(*)::BIGINT AS count
  FROM hook_source
  WHERE NULLIF(label, '') IS NOT NULL
  GROUP BY left(label, 90)
  ORDER BY count DESC, label ASC
  LIMIT 5
)
SELECT
  s.total_ads,
  s.active_ads,
  s.inactive_ads,
  s.unknown_ads,
  s.video_ads,
  s.image_ads,
  s.carousel_ads,
  s.creator_ads,
  COALESCE(s.average_running_days, 0),
  COALESCE(s.longest_running_days, 0),
  s.last_observed_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', cc.label, 'count', cc.count) ORDER BY cc.count DESC, cc.label ASC) FROM creator_counts cc), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', oc.label, 'count', oc.count) ORDER BY oc.count DESC, oc.label ASC) FROM offer_counts oc), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', hc.label, 'count', hc.count) ORDER BY hc.count DESC, hc.label ASC) FROM hook_counts hc), '[]'::jsonb)
FROM summary s;
$$;;

REVOKE ALL ON FUNCTION public.adspy_search_metrics_v2_generic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_metrics_v2_generic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v4_generic: advertiser-name predicate only (keyword branch unchanged).
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v4_generic(
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
         AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(n.query_value, '\', '\\'), '%', '\%'), '_', '\_') || '%')
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
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 36)))
OFFSET (
  GREATEST(1, COALESCE(p_page, 1)) - 1
) * LEAST(60, GREATEST(1, COALESCE(p_limit, 36)));
$$;;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v4_generic(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v4_generic(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v5_generic: advertiser-name predicate only (keyword branch unchanged).
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
         AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(n.query_value, '\', '\\'), '%', '\%'), '_', '\_') || '%')
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

-- adspy_search_metrics_v2_name: copy of adspy_search_metrics_v2_generic for advertiser mode without a Page ID;
-- the page/mode OR block is one top-level LIKE (index-usable).
CREATE OR REPLACE FUNCTION public.adspy_search_metrics_v2_name(
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
RETURNS TABLE (
  total_ads BIGINT,
  active_ads BIGINT,
  inactive_ads BIGINT,
  unknown_ads BIGINT,
  video_ads BIGINT,
  image_ads BIGINT,
  carousel_ads BIGINT,
  creator_ads BIGINT,
  average_running_days NUMERIC,
  longest_running_days INTEGER,
  last_observed_at TIMESTAMPTZ,
  top_creators JSONB,
  top_offers JSONB,
  top_hooks JSONB
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
    AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(lower(trim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
),
with_running_days AS (
  SELECT
    f.*,
    CASE
      WHEN f.first_seen_at IS NULL THEN NULL
      ELSE GREATEST(
        1,
        FLOOR(
          EXTRACT(
            EPOCH FROM (
              COALESCE(f.last_seen_at, NOW()) - f.first_seen_at
            )
          ) / 86400
        )::INTEGER + 1
      )
    END AS running_days
  FROM filtered f
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS total_ads,
    COUNT(*) FILTER (WHERE is_currently_active = TRUE)::BIGINT AS active_ads,
    COUNT(*) FILTER (WHERE is_currently_active = FALSE)::BIGINT AS inactive_ads,
    COUNT(*) FILTER (WHERE is_currently_active IS NULL)::BIGINT AS unknown_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'video')::BIGINT AS video_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'image')::BIGINT AS image_ads,
    COUNT(*) FILTER (WHERE lower(COALESCE(creative_type, '')) = 'carousel')::BIGINT AS carousel_ads,
    COUNT(*) FILTER (WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL)::BIGINT AS creator_ads,
    ROUND(AVG(running_days) FILTER (WHERE running_days IS NOT NULL), 0)::NUMERIC AS average_running_days,
    MAX(running_days)::INTEGER AS longest_running_days,
    GREATEST(MAX(last_seen_at), MAX(updated_at), MAX(first_seen_at)) AS last_observed_at
  FROM with_running_days
),
creator_counts AS (
  SELECT trim(creator_name) AS label, COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
  GROUP BY trim(creator_name)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
offer_counts AS (
  SELECT trim(offer) AS label, COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(offer, '')), '') IS NOT NULL
  GROUP BY trim(offer)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
hook_source AS (
  SELECT trim(substring(COALESCE(NULLIF(primary_text, ''), headline, '') FROM '^[^.!?]+')) AS label
  FROM with_running_days
),
hook_counts AS (
  SELECT left(label, 90) AS label, COUNT(*)::BIGINT AS count
  FROM hook_source
  WHERE NULLIF(label, '') IS NOT NULL
  GROUP BY left(label, 90)
  ORDER BY count DESC, label ASC
  LIMIT 5
)
SELECT
  s.total_ads,
  s.active_ads,
  s.inactive_ads,
  s.unknown_ads,
  s.video_ads,
  s.image_ads,
  s.carousel_ads,
  s.creator_ads,
  COALESCE(s.average_running_days, 0),
  COALESCE(s.longest_running_days, 0),
  s.last_observed_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', cc.label, 'count', cc.count) ORDER BY cc.count DESC, cc.label ASC) FROM creator_counts cc), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', oc.label, 'count', oc.count) ORDER BY oc.count DESC, oc.label ASC) FROM offer_counts oc), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(jsonb_build_object('label', hc.label, 'count', hc.count) ORDER BY hc.count DESC, hc.label ASC) FROM hook_counts hc), '[]'::jsonb)
FROM summary s;
$$;;

REVOKE ALL ON FUNCTION public.adspy_search_metrics_v2_name(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adspy_search_metrics_v2_name(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v4_name: copy of adspy_search_creatives_v4_generic for advertiser mode without a Page ID;
-- the page/mode OR block is one top-level LIKE (index-usable).
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v4_name(
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
    AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(lower(trim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
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
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 36)))
OFFSET (
  GREATEST(1, COALESCE(p_page, 1)) - 1
) * LEAST(60, GREATEST(1, COALESCE(p_limit, 36)));
$$;;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v4_name(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v4_name(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v5_name: copy of adspy_search_creatives_v5_generic for advertiser mode without a Page ID;
-- the page/mode OR block is one top-level LIKE (index-usable).
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v5_name(
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
    AND lower(c.advertiser_name) LIKE '%' || replace(replace(replace(lower(trim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%'
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

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v5_name(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v5_name(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_metrics_v2: dispatcher; adds the advertiser-name branch -> adspy_search_metrics_v2_name.
CREATE OR REPLACE FUNCTION public.adspy_search_metrics_v2(
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
RETURNS TABLE (
  total_ads BIGINT, active_ads BIGINT, inactive_ads BIGINT, unknown_ads BIGINT,
  video_ads BIGINT, image_ads BIGINT, carousel_ads BIGINT, creator_ads BIGINT,
  average_running_days NUMERIC, longest_running_days INTEGER, last_observed_at TIMESTAMPTZ,
  top_creators JSONB, top_offers JSONB, top_hooks JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF trim(COALESCE(p_advertiser_page_id, '')) <> '' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_metrics_v2_page(
      p_query, p_country, p_platform, p_mode, trim(p_advertiser_page_id),
      p_language, p_region, p_creative_type, p_active_status);
  ELSIF lower(trim(COALESCE(p_mode, 'advertiser'))) = 'advertiser' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_metrics_v2_name(
      p_query, p_country, p_platform, p_mode, p_advertiser_page_id,
      p_language, p_region, p_creative_type, p_active_status);
  ELSE
    RETURN QUERY SELECT * FROM public.adspy_search_metrics_v2_generic(
      p_query, p_country, p_platform, p_mode, p_advertiser_page_id,
      p_language, p_region, p_creative_type, p_active_status);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_metrics_v2(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_metrics_v2(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v4: dispatcher; adds the advertiser-name branch -> adspy_search_creatives_v4_name.
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v4(
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
RETURNS TABLE (total_count BIGINT, creative JSONB, markets JSONB, languages JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF trim(COALESCE(p_advertiser_page_id, '')) <> '' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v4_page(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, trim(p_advertiser_page_id),
      p_language, p_region, p_creative_type, p_active_status);
  ELSIF lower(trim(COALESCE(p_mode, 'advertiser'))) = 'advertiser' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v4_name(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, p_advertiser_page_id,
      p_language, p_region, p_creative_type, p_active_status);
  ELSE
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v4_generic(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, p_advertiser_page_id,
      p_language, p_region, p_creative_type, p_active_status);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v4(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v4(TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- adspy_search_creatives_v5: dispatcher; adds the advertiser-name branch -> adspy_search_creatives_v5_name.
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
  ELSIF lower(trim(COALESCE(p_mode, 'advertiser'))) = 'advertiser' THEN
    RETURN QUERY SELECT * FROM public.adspy_search_creatives_v5_name(
      p_query, p_country, p_platform, p_mode, p_page, p_limit, p_advertiser_page_id,
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

-- adspy_search_facets: advertiser-name (ELSE) branch only.
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
VOLATILE
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
  v_summary  public.adspy_advertiser_summaries;
  v_ids      UUID[];
BEGIN
  IF v_page <> '' THEN
    IF NOT v_filtered THEN
      SELECT * INTO v_summary FROM public.adspy_advertiser_summaries
      WHERE platform = v_platform AND advertiser_id = v_page AND country = v_country;
      IF NOT FOUND OR v_summary.computed_at < now() - interval '6 hours' THEN
        v_summary := public.adspy_refresh_advertiser_summary(v_platform, v_page, v_country);
      END IF;
      RETURN v_summary.facets;
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

COMMIT;
