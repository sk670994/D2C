BEGIN;

-- ============================================================
-- Zooptrack AdSpy Creative Retrieval v3
--
-- Goals:
--   • Fast paginated creative retrieval
--   • Exact total count
--   • Exact advertiser Page-ID match when available
--   • Safe fallback to advertiser-name matching if the selected
--     Page ID is stale/incompatible with stored creative rows
--   • Country-scoped market enrichment
--   • Language enrichment
--
-- Browser receives only one page at a time.
-- ============================================================

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
  WITH
  normalized AS (
    SELECT
      lower(trim(COALESCE(p_query, ''))) AS query_value,
      upper(trim(COALESCE(p_country, 'IN'))) AS country_value,
      lower(trim(COALESCE(p_platform, 'meta'))) AS platform_value,
      lower(trim(COALESCE(p_mode, 'advertiser'))) AS mode_value,
      trim(COALESCE(p_advertiser_page_id, '')) AS page_id_value
  ),

  exact_filtered AS (
    SELECT
      c.*
    FROM public.ad_intelligence_creatives c
    CROSS JOIN normalized n
    WHERE
      n.page_id_value <> ''
      AND lower(c.platform) = n.platform_value
      AND trim(COALESCE(c.advertiser_id, '')) = n.page_id_value
      AND EXISTS (
        SELECT 1
        FROM public.ad_intelligence_markets m
        WHERE
          m.creative_id = c.id
          AND upper(trim(m.country)) = n.country_value
      )
  ),

  fallback_filtered AS (
    SELECT
      c.*
    FROM public.ad_intelligence_creatives c
    CROSS JOIN normalized n
    WHERE
      lower(c.platform) = n.platform_value

      AND EXISTS (
        SELECT 1
        FROM public.ad_intelligence_markets m
        WHERE
          m.creative_id = c.id
          AND upper(trim(m.country)) = n.country_value
      )

      AND (
        (
          n.mode_value = 'advertiser'
          AND strpos(
            lower(COALESCE(c.advertiser_name, '')),
            n.query_value
          ) > 0
        )

        OR

        (
          n.mode_value = 'keyword'
          AND (
            strpos(
              lower(COALESCE(c.advertiser_name, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.creator_name, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.headline, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.product_name, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.primary_text, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.description, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.offer, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.call_to_action, '')),
              n.query_value
            ) > 0

            OR strpos(
              lower(COALESCE(c.landing_page_url, '')),
              n.query_value
            ) > 0
          )
        )
      )
  ),

  chosen AS (
    SELECT *
    FROM exact_filtered

    UNION ALL

    SELECT *
    FROM fallback_filtered
    WHERE NOT EXISTS (
      SELECT 1
      FROM exact_filtered
    )
  )

  SELECT
    COUNT(*) OVER () AS total_count,

    to_jsonb(c) AS creative,

    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(m)
          ORDER BY m.id
        )
        FROM public.ad_intelligence_markets m
        CROSS JOIN normalized n
        WHERE
          m.creative_id = c.id
          AND upper(trim(m.country)) = n.country_value
      ),
      '[]'::jsonb
    ) AS markets,

    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(l)
          ORDER BY l.id
        )
        FROM public.ad_intelligence_languages l
        WHERE l.creative_id = c.id
      ),
      '[]'::jsonb
    ) AS languages

  FROM chosen c

  ORDER BY
    c.is_currently_active DESC NULLS LAST,
    c.last_seen_at DESC NULLS LAST,
    c.id

  LIMIT LEAST(
    60,
    GREATEST(
      1,
      COALESCE(p_limit, 36)
    )
  )

  OFFSET
    (
      GREATEST(
        1,
        COALESCE(p_page, 1)
      ) - 1
    )
    *
    LEAST(
      60,
      GREATEST(
        1,
        COALESCE(p_limit, 36)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.adspy_search_creatives_v3(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_search_creatives_v3(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT
) TO service_role;

COMMIT;