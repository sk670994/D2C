CREATE OR REPLACE FUNCTION public.adspy_search_page_ids(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
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
  AND EXISTS (
    SELECT 1
    FROM public.ad_intelligence_markets m
    WHERE m.creative_id = c.id
      AND upper(trim(m.country)) = upper(trim(COALESCE(p_country, 'IN')))
  )
  AND (
    (
      lower(trim(COALESCE(p_mode, 'advertiser'))) = 'advertiser'
      AND strpos(
        lower(COALESCE(c.advertiser_name, '')),
        lower(trim(COALESCE(p_query, '')))
      ) > 0
    )
    OR
    (
      lower(trim(COALESCE(p_mode, 'advertiser'))) = 'keyword'
      AND (
        strpos(lower(COALESCE(c.advertiser_name, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.creator_name, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.headline, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.product_name, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.primary_text, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.description, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.offer, '')), lower(trim(COALESCE(p_query, '')))) > 0
        OR strpos(lower(COALESCE(c.landing_page_url, '')), lower(trim(COALESCE(p_query, '')))) > 0
      )
    )
  )
ORDER BY
  c.is_currently_active DESC NULLS LAST,
  c.last_seen_at DESC NULLS LAST,
  c.id
LIMIT LEAST(60, GREATEST(1, COALESCE(p_limit, 24)))
OFFSET (GREATEST(1, COALESCE(p_page, 1)) - 1) * LEAST(60, GREATEST(1, COALESCE(p_limit, 24)));
$$;

REVOKE ALL ON FUNCTION public.adspy_search_page_ids(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_page_ids(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO service_role;;
