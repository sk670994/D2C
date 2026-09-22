BEGIN;

-- AdSpy Core Filters v1
-- Indexed search only. Collection/Playwright remains on the durable refresh path.
-- Language is observed creative-language enrichment, not Meta targeting metadata.
-- Region is observed market enrichment (region/state/city/country name).
-- Page ID is authoritative when supplied.

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
  WHERE lower(c.platform) = n.platform_value
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = n.country_value
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
$$;

REVOKE ALL ON FUNCTION public.adspy_search_metrics_v2(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_metrics_v2(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT
) TO service_role;


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
  WHERE lower(c.platform) = n.platform_value
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = n.country_value
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
        AND upper(trim(m.country)) = n.country_value
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

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v4(
  TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v4(
  TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT
) TO service_role;

COMMIT;
