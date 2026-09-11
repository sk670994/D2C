-- AdSpy exact advertiser search by Meta Page ID.
-- The Page ID is authoritative after a user selects an advertiser
-- from autocomplete. This prevents similarly named advertisers
-- from being mixed into the selected brand's result set.

CREATE OR REPLACE FUNCTION public.adspy_search_page_ids_by_advertiser(
  p_page_id TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 24
)
RETURNS TABLE (creative_id UUID)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT c.id AS creative_id
FROM public.ad_intelligence_creatives c
WHERE lower(c.platform) = lower(trim(COALESCE(p_platform, 'meta')))
  AND trim(COALESCE(c.advertiser_id, '')) = trim(COALESCE(p_page_id, ''))
  AND EXISTS (
    SELECT 1
    FROM public.ad_intelligence_markets m
    WHERE m.creative_id = c.id
      AND upper(trim(m.country)) = upper(trim(COALESCE(p_country, 'IN')))
  )
ORDER BY
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 24)))
OFFSET (GREATEST(1, COALESCE(p_page, 1)) - 1)
  * LEAST(60, GREATEST(1, COALESCE(p_limit, 24)));
$$;

REVOKE ALL ON FUNCTION public.adspy_search_page_ids_by_advertiser(
  TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_search_page_ids_by_advertiser(
  TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO service_role;


CREATE OR REPLACE FUNCTION public.adspy_search_metrics_by_advertiser(
  p_page_id TEXT,
  p_country TEXT,
  p_platform TEXT
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
WITH filtered AS (
  SELECT
    c.*,
    CASE
      WHEN c.first_seen_at IS NULL THEN NULL
      ELSE GREATEST(
        1,
        FLOOR(
          EXTRACT(
            EPOCH FROM (
              COALESCE(c.last_seen_at, NOW()) - c.first_seen_at
            )
          ) / 86400
        )::INTEGER + 1
      )
    END AS running_days
  FROM public.ad_intelligence_creatives c
  WHERE lower(c.platform) = lower(trim(COALESCE(p_platform, 'meta')))
    AND trim(COALESCE(c.advertiser_id, '')) = trim(COALESCE(p_page_id, ''))
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = upper(trim(COALESCE(p_country, 'IN')))
    )
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
    COUNT(*) FILTER (
      WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
    )::BIGINT AS creator_ads,
    ROUND(
      AVG(running_days) FILTER (WHERE running_days IS NOT NULL),
      0
    )::NUMERIC AS average_running_days,
    MAX(running_days)::INTEGER AS longest_running_days,
    GREATEST(
      MAX(last_seen_at),
      MAX(updated_at),
      MAX(first_seen_at)
    ) AS last_observed_at
  FROM filtered
),
creator_counts AS (
  SELECT trim(creator_name) AS label, COUNT(*)::BIGINT AS count
  FROM filtered
  WHERE NULLIF(trim(COALESCE(creator_name, '')), '') IS NOT NULL
  GROUP BY trim(creator_name)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
offer_counts AS (
  SELECT trim(offer) AS label, COUNT(*)::BIGINT AS count
  FROM filtered
  WHERE NULLIF(trim(COALESCE(offer, '')), '') IS NOT NULL
  GROUP BY trim(offer)
  ORDER BY count DESC, label ASC
  LIMIT 5
),
hook_source AS (
  SELECT trim(
    substring(
      COALESCE(NULLIF(primary_text, ''), headline, '')
      FROM '^[^.!?。！？]+'
    )
  ) AS label
  FROM filtered
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
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('label', cc.label, 'count', cc.count)
        ORDER BY cc.count DESC, cc.label ASC
      )
      FROM creator_counts cc
    ),
    '[]'::jsonb
  ) AS top_creators,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('label', oc.label, 'count', oc.count)
        ORDER BY oc.count DESC, oc.label ASC
      )
      FROM offer_counts oc
    ),
    '[]'::jsonb
  ) AS top_offers,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('label', hc.label, 'count', hc.count)
        ORDER BY hc.count DESC, hc.label ASC
      )
      FROM hook_counts hc
    ),
    '[]'::jsonb
  ) AS top_hooks
FROM summary s;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_metrics_by_advertiser(
  TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_search_metrics_by_advertiser(
  TEXT, TEXT, TEXT
) TO service_role;


CREATE OR REPLACE FUNCTION public.adspy_search_longest_creative_by_advertiser(
  p_page_id TEXT,
  p_country TEXT,
  p_platform TEXT
)
RETURNS TABLE (
  advertiser_name TEXT,
  headline TEXT,
  creative_type TEXT,
  creator_name TEXT,
  call_to_action TEXT,
  offer TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  running_days INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT
  c.advertiser_name,
  c.headline,
  c.creative_type,
  c.creator_name,
  c.call_to_action,
  c.offer,
  c.first_seen_at,
  c.last_seen_at,
  CASE
    WHEN c.first_seen_at IS NULL THEN NULL
    ELSE GREATEST(
      1,
      FLOOR(
        EXTRACT(
          EPOCH FROM (COALESCE(c.last_seen_at, NOW()) - c.first_seen_at)
        ) / 86400
      )::INTEGER + 1
    )
  END AS running_days
FROM public.ad_intelligence_creatives c
WHERE lower(c.platform) = lower(trim(COALESCE(p_platform, 'meta')))
  AND trim(COALESCE(c.advertiser_id, '')) = trim(COALESCE(p_page_id, ''))
  AND EXISTS (
    SELECT 1
    FROM public.ad_intelligence_markets m
    WHERE m.creative_id = c.id
      AND upper(trim(m.country)) = upper(trim(COALESCE(p_country, 'IN')))
  )
ORDER BY
  running_days DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_longest_creative_by_advertiser(
  TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_search_longest_creative_by_advertiser(
  TEXT, TEXT, TEXT
) TO service_role;
