-- AdSpy P0 analytics contract
-- Purpose:
-- 1) Make country filtering authoritative through ad_intelligence_markets.
-- 2) Calculate global metrics in PostgreSQL instead of from the visible page.
-- 3) Keep active/inactive/unknown semantics explicit.
-- 4) Keep freshness tied to observed source timestamps.

CREATE OR REPLACE FUNCTION public.adspy_search_metrics(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser'
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
    lower(trim(p_query)) AS q,
    upper(trim(COALESCE(p_country, 'IN'))) AS country,
    lower(trim(COALESCE(p_platform, 'meta'))) AS platform,
    lower(trim(COALESCE(p_mode, 'advertiser'))) AS mode
),
filtered AS (
  SELECT
    c.*
  FROM public.ad_intelligence_creatives c
  CROSS JOIN normalized n
  WHERE lower(c.platform) = n.platform
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = n.country
    )
    AND (
      (
        n.mode = 'advertiser'
        AND strpos(
          lower(COALESCE(c.advertiser_name, '')),
          n.q
        ) > 0
      )
      OR
      (
        n.mode = 'keyword'
        AND (
          strpos(lower(COALESCE(c.advertiser_name, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.creator_name, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.headline, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.product_name, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.primary_text, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.description, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.offer, '')), n.q) > 0
          OR strpos(lower(COALESCE(c.landing_page_url, '')), n.q) > 0
        )
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
              COALESCE(f.last_seen_at, NOW())
              - f.first_seen_at
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
    COUNT(*) FILTER (
      WHERE is_currently_active = TRUE
    )::BIGINT AS active_ads,
    COUNT(*) FILTER (
      WHERE is_currently_active = FALSE
    )::BIGINT AS inactive_ads,
    COUNT(*) FILTER (
      WHERE is_currently_active IS NULL
    )::BIGINT AS unknown_ads,
    COUNT(*) FILTER (
      WHERE lower(COALESCE(creative_type, '')) = 'video'
    )::BIGINT AS video_ads,
    COUNT(*) FILTER (
      WHERE lower(COALESCE(creative_type, '')) = 'image'
    )::BIGINT AS image_ads,
    COUNT(*) FILTER (
      WHERE lower(COALESCE(creative_type, '')) = 'carousel'
    )::BIGINT AS carousel_ads,
    COUNT(*) FILTER (
      WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
    )::BIGINT AS creator_ads,
    ROUND(
      AVG(running_days) FILTER (
        WHERE running_days IS NOT NULL
      ),
      0
    )::NUMERIC AS average_running_days,
    MAX(running_days)::INTEGER AS longest_running_days,
    GREATEST(
      MAX(last_seen_at),
      MAX(updated_at),
      MAX(first_seen_at)
    ) AS last_observed_at
  FROM with_running_days
),
creator_counts AS (
  SELECT
    trim(creator_name) AS label,
    COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
  GROUP BY trim(creator_name)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
offer_counts AS (
  SELECT
    trim(offer) AS label,
    COUNT(*)::BIGINT AS count
  FROM with_running_days
  WHERE NULLIF(trim(COALESCE(offer, '')), '') IS NOT NULL
  GROUP BY trim(offer)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
hook_source AS (
  SELECT
    trim(
      substring(
        COALESCE(NULLIF(primary_text, ''), headline, '')
        FROM '^[^.!?。！？]+'
      )
    ) AS label
  FROM with_running_days
),
hook_counts AS (
  SELECT
    left(label, 90) AS label,
    COUNT(*)::BIGINT AS count
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
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', cc.label,
          'count', cc.count
        )
        ORDER BY cc.count DESC, cc.label ASC
      )
      FROM creator_counts cc
    ),
    '[]'::jsonb
  ) AS top_creators,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', oc.label,
          'count', oc.count
        )
        ORDER BY oc.count DESC, oc.label ASC
      )
      FROM offer_counts oc
    ),
    '[]'::jsonb
  ) AS top_offers,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', hc.label,
          'count', hc.count
        )
        ORDER BY hc.count DESC, hc.label ASC
      )
      FROM hook_counts hc
    ),
    '[]'::jsonb
  ) AS top_hooks
FROM summary s;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_metrics(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_search_metrics(
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
