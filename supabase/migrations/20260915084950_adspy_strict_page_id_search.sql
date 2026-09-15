BEGIN;

-- Selected Meta advertiser identities are authoritative. When a Page ID is
-- supplied, never fall back to a fuzzy advertiser-name match.
CREATE OR REPLACE FUNCTION public.adspy_search_creatives_v3(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 36,
  p_advertiser_page_id TEXT DEFAULT NULL
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
      trim(COALESCE(p_advertiser_page_id, '')) AS page_id_value
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
      )
      AND (
        (
          n.page_id_value <> ''
          AND trim(COALESCE(c.advertiser_id, '')) = n.page_id_value
        )
        OR (
          n.page_id_value = ''
          AND (
            (n.mode_value = 'advertiser' AND strpos(lower(COALESCE(c.advertiser_name, '')), n.query_value) > 0)
            OR
            (n.mode_value = 'keyword' AND (
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
      ), '[]'::jsonb
    ) AS markets,
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
        FROM public.ad_intelligence_languages l
        WHERE l.creative_id = c.id
      ), '[]'::jsonb
    ) AS languages
  FROM filtered c
  ORDER BY c.is_currently_active DESC NULLS LAST, c.last_seen_at DESC NULLS LAST, c.id
  LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 36)))
  OFFSET (GREATEST(1, COALESCE(p_page, 1)) - 1) * LEAST(60, GREATEST(1, COALESCE(p_limit, 36)));
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v3(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v3(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT) TO service_role;

COMMIT;
