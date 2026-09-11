CREATE OR REPLACE FUNCTION public.adspy_analysis_rows(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_limit INTEGER DEFAULT 20000
)
RETURNS TABLE (
  id UUID,
  advertiser_name TEXT,
  creator_name TEXT,
  creative_type TEXT,
  primary_text TEXT,
  headline TEXT,
  offer TEXT,
  call_to_action TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_currently_active BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.advertiser_name,
    c.creator_name,
    c.creative_type,
    c.primary_text,
    c.headline,
    c.offer,
    c.call_to_action,
    c.first_seen_at,
    c.last_seen_at,
    c.is_currently_active
  FROM public.ad_intelligence_creatives AS c
  WHERE lower(c.platform) = lower(trim(p_platform))
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets AS m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) = upper(trim(p_country))
    )
    AND (
      (
        lower(trim(p_mode)) = 'advertiser'
        AND lower(coalesce(c.advertiser_name, ''))
          LIKE '%' || lower(trim(p_query)) || '%'
      )
      OR
      (
        lower(trim(p_mode)) = 'keyword'
        AND (
          lower(coalesce(c.advertiser_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.creator_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.headline, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.product_name, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.primary_text, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.description, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.offer, '')) LIKE '%' || lower(trim(p_query)) || '%'
          OR lower(coalesce(c.call_to_action, '')) LIKE '%' || lower(trim(p_query)) || '%'
        )
      )
    )
  ORDER BY c.last_seen_at DESC NULLS LAST, c.id
  LIMIT LEAST(
    20000,
    GREATEST(1, COALESCE(p_limit, 20000))
  );
$$;

REVOKE ALL ON FUNCTION public.adspy_analysis_rows(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_analysis_rows(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) TO service_role;
