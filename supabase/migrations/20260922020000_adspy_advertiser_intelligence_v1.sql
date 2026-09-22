BEGIN;

CREATE TABLE IF NOT EXISTS public.adspy_advertiser_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, advertiser_id, country)
);

CREATE INDEX IF NOT EXISTS adspy_watchlists_user_idx
  ON public.adspy_advertiser_watchlists(user_id, updated_at DESC);

ALTER TABLE public.adspy_advertiser_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adspy_watchlist_select_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_select_own
  ON public.adspy_advertiser_watchlists
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS adspy_watchlist_insert_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_insert_own
  ON public.adspy_advertiser_watchlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS adspy_watchlist_delete_own
  ON public.adspy_advertiser_watchlists;
CREATE POLICY adspy_watchlist_delete_own
  ON public.adspy_advertiser_watchlists
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_profile(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta'
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country, 'IN')))
    )
),
stats AS (
  SELECT
    count(*)::BIGINT AS total_ads,
    count(*) FILTER (WHERE is_currently_active = true)::BIGINT AS active_ads,
    count(*) FILTER (WHERE is_currently_active = false)::BIGINT AS inactive_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%video%')::BIGINT AS video_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%image%')::BIGINT AS image_ads,
    count(*) FILTER (WHERE creative_type ILIKE '%carousel%')::BIGINT AS carousel_ads,
    count(*) FILTER (WHERE creator_name IS NOT NULL AND trim(creator_name) <> '')::BIGINT AS creator_ads,
    min(first_seen_at) AS first_seen_at,
    max(last_seen_at) AS last_seen_at,
    round(avg(
      CASE
        WHEN first_seen_at IS NULL THEN NULL
        ELSE greatest(
          1,
          floor(extract(epoch from (coalesce(last_seen_at, now()) - first_seen_at)) / 86400.0) + 1
        )
      END
    ), 1) AS average_running_days,
    coalesce(max(
      CASE
        WHEN first_seen_at IS NULL THEN 0
        ELSE greatest(
          1,
          floor(extract(epoch from (coalesce(last_seen_at, now()) - first_seen_at)) / 86400.0) + 1
        )
      END
    ), 0)::INTEGER AS longest_running_days
  FROM base
),
tops AS (
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', creator_name, 'count', n)
        ORDER BY n DESC, creator_name
      )
      FROM (
        SELECT creator_name, count(*)::BIGINT AS n
        FROM base
        WHERE creator_name IS NOT NULL AND trim(creator_name) <> ''
        GROUP BY creator_name
        ORDER BY n DESC, creator_name
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_creators,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', offer, 'count', n)
        ORDER BY n DESC, offer
      )
      FROM (
        SELECT offer, count(*)::BIGINT AS n
        FROM base
        WHERE offer IS NOT NULL AND trim(offer) <> ''
        GROUP BY offer
        ORDER BY n DESC, offer
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_offers,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('label', hook, 'count', n)
        ORDER BY n DESC, hook
      )
      FROM (
        SELECT
          coalesce(
            nullif(intelligence->>'hook', ''),
            nullif(metadata->>'hook', ''),
            nullif(headline, '')
          ) AS hook,
          count(*)::BIGINT AS n
        FROM base
        GROUP BY 1
        HAVING coalesce(
          nullif(intelligence->>'hook', ''),
          nullif(metadata->>'hook', ''),
          nullif(headline, '')
        ) IS NOT NULL
        ORDER BY n DESC
        LIMIT 8
      ) q
    ), '[]'::jsonb) AS top_hooks
)
SELECT jsonb_build_object(
  'advertiserId', trim(p_page_id),
  'advertiserName', (
    SELECT advertiser_name
    FROM base
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ),
  'platform', lower(trim(p_platform)),
  'country', upper(trim(coalesce(p_country, 'IN'))),
  'totalAds', s.total_ads,
  'activeAds', s.active_ads,
  'inactiveAds', s.inactive_ads,
  'videoAds', s.video_ads,
  'imageAds', s.image_ads,
  'carouselAds', s.carousel_ads,
  'creatorAds', s.creator_ads,
  'firstSeenAt', s.first_seen_at,
  'lastSeenAt', s.last_seen_at,
  'averageRunningDays', s.average_running_days,
  'longestRunningDays', s.longest_running_days,
  'topCreators', t.top_creators,
  'topOffers', t.top_offers,
  'topHooks', t.top_hooks
)
FROM stats s
CROSS JOIN tops t;
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_profile(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_profile(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_timeline(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta',
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE(
  month_start DATE,
  observed_ads BIGINT,
  new_ads BIGINT,
  stopped_ads BIGINT
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH months AS (
  SELECT generate_series(
    date_trunc('month', now()) -
      make_interval(months => greatest(1, least(coalesce(p_months,12),24)) - 1),
    date_trunc('month', now()),
    interval '1 month'
  )::DATE AS month_start
),
base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country,'IN')))
    )
)
SELECT
  m.month_start,
  count(b.id) FILTER (
    WHERE b.first_seen_at < m.month_start + interval '1 month'
      AND coalesce(b.last_seen_at, now()) >= m.month_start
  ) AS observed_ads,
  count(b.id) FILTER (
    WHERE b.first_seen_at >= m.month_start
      AND b.first_seen_at < m.month_start + interval '1 month'
  ) AS new_ads,
  count(b.id) FILTER (
    WHERE b.is_currently_active = false
      AND b.last_seen_at >= m.month_start
      AND b.last_seen_at < m.month_start + interval '1 month'
  ) AS stopped_ads
FROM months m
LEFT JOIN base b ON true
GROUP BY m.month_start
ORDER BY m.month_start;
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_timeline(TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_timeline(TEXT,TEXT,TEXT,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.adspy_get_advertiser_changes(
  p_page_id TEXT,
  p_country TEXT DEFAULT 'IN',
  p_platform TEXT DEFAULT 'meta',
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
WITH base AS (
  SELECT c.*
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = lower(trim(p_platform))
    AND c.advertiser_id = trim(p_page_id)
    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(m.country) = upper(trim(coalesce(p_country,'IN')))
    )
),
recent AS (
  SELECT *
  FROM base
  WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))
     OR last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))
)
SELECT jsonb_build_object(
  'windowDays', greatest(1, least(coalesce(p_days,30),90)),
  'newAds', (SELECT count(*) FROM recent WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))),
  'stoppedAds', (SELECT count(*) FROM recent WHERE is_currently_active = false AND last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))),
  'newCreativeIds', coalesce((SELECT jsonb_agg(coalesce(external_ad_id, external_ad_key, id::text) ORDER BY first_seen_at DESC)
                              FROM recent
                              WHERE first_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))), '[]'::jsonb),
  'stoppedCreativeIds', coalesce((SELECT jsonb_agg(coalesce(external_ad_id, external_ad_key, id::text) ORDER BY last_seen_at DESC)
                                 FROM recent
                                 WHERE is_currently_active = false
                                   AND last_seen_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),90)))), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.adspy_get_advertiser_changes(TEXT,TEXT,TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_get_advertiser_changes(TEXT,TEXT,TEXT,INTEGER) TO service_role;

COMMIT;
