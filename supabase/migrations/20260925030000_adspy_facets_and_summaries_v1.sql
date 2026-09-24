-- AdSpy facets in SQL + precomputed advertiser summaries (v1)
--
-- Before: /api/ad-intelligence/facets pulled up to 5 x 1000 creatives (with
-- embedded markets + languages) over PostgREST per search and counted them in
-- Node; counts were capped at 5,000 and re-computed on every request.
--
-- After:
--   * adspy_search_facets(...)  - same semantics as lib/ad-intelligence/global/
--     facets.ts (each dimension counted with every OTHER filter applied, so a
--     count equals the results you get by clicking it), one round trip, no cap.
--     Page-ID requests use the index range scan (advertiser_id = page_id).
--   * adspy_advertiser_summaries - per (platform, advertiser_id, country)
--     unfiltered facets + metrics, refreshed after ingestion
--     (adspy_refresh_advertiser_summary) and lazily when older than 6h.
--     Unfiltered advertiser views read one row instead of aggregating.
--
-- Additive only: new table + new functions. Nothing existing is changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.adspy_advertiser_summaries (
  platform       TEXT        NOT NULL,
  advertiser_id  TEXT        NOT NULL,
  country        TEXT        NOT NULL,
  total_ads      INTEGER     NOT NULL DEFAULT 0,
  active_ads     INTEGER     NOT NULL DEFAULT 0,
  facets         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metrics        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, advertiser_id, country)
);

ALTER TABLE public.adspy_advertiser_summaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adspy_advertiser_summaries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adspy_advertiser_summaries TO service_role;


-- Facets for an explicit set of creative ids (shared by all search modes).
CREATE OR REPLACE FUNCTION public.adspy_facets_for_ids(
  p_ids UUID[],
  p_country TEXT,
  p_language TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_creative_type TEXT DEFAULT NULL,
  p_active_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH p AS (
  SELECT
    upper(trim(COALESCE(p_country, 'IN')))           AS country,
    lower(trim(COALESCE(p_language, '')))            AS lang,
    lower(trim(COALESCE(p_region, '')))              AS region,
    lower(trim(COALESCE(p_creative_type, '')))       AS ct,
    lower(trim(COALESCE(p_active_status, '')))       AS st,
    (date_trunc('week', now() AT TIME ZONE 'UTC'))::date AS this_week
),
b AS (
  SELECT c.id,
         lower(COALESCE(c.creative_type, '')) AS ct,
         c.is_currently_active                AS act,
         c.first_seen_at                      AS fs
  FROM public.ad_intelligence_creatives c
  WHERE c.id = ANY (p_ids)
),
lang AS (
  SELECT l.creative_id AS id,
         lower(trim(l.language_code)) AS code,
         max(NULLIF(trim(l.language_name), '')) AS name
  FROM public.ad_intelligence_languages l
  WHERE l.creative_id = ANY (p_ids)
    AND NULLIF(trim(l.language_code), '') IS NOT NULL
  GROUP BY 1, 2
),
mk AS (
  SELECT m.creative_id AS id,
         lower(trim(COALESCE(NULLIF(m.state_name, ''), NULLIF(m.region, ''), NULLIF(m.city_name, ''), ''))) AS key,
         max(trim(COALESCE(NULLIF(m.state_name, ''), NULLIF(m.region, ''), NULLIF(m.city_name, ''), ''))) AS label
  FROM public.ad_intelligence_markets m, p
  WHERE m.creative_id = ANY (p_ids) AND m.country = p.country
  GROUP BY 1, 2
),
f AS (
  SELECT b.*,
    (p.lang = '' OR EXISTS (
       SELECT 1 FROM public.ad_intelligence_languages l
       WHERE l.creative_id = b.id
         AND (lower(trim(l.language_code)) = p.lang OR lower(trim(COALESCE(l.language_name, ''))) = p.lang))) AS f_lang,
    (p.region = '' OR EXISTS (
       SELECT 1 FROM public.ad_intelligence_markets m
       WHERE m.creative_id = b.id AND m.country = p.country
         AND (strpos(lower(COALESCE(m.region, '')), p.region) > 0
           OR strpos(lower(COALESCE(m.state_name, '')), p.region) > 0
           OR strpos(lower(COALESCE(m.city_name, '')), p.region) > 0
           OR strpos(lower(COALESCE(m.country_name, '')), p.region) > 0))) AS f_region,
    (p.ct = '' OR b.ct = p.ct) AS f_fmt,
    (p.st = '' OR (p.st = 'active' AND b.act IS TRUE) OR (p.st = 'inactive' AND b.act IS FALSE)
       OR p.st NOT IN ('active', 'inactive')) AS f_st
  FROM b, p
),
hits AS (SELECT * FROM f WHERE f_lang AND f_region AND f_fmt AND f_st),
status_b AS (
  SELECT CASE WHEN act THEN 'active' ELSE 'inactive' END AS value,
         CASE WHEN act THEN 'Active' ELSE 'Inactive' END AS label,
         count(*) AS count
  FROM f WHERE f_lang AND f_region AND f_fmt AND act IS NOT NULL
  GROUP BY 1, 2
),
format_b AS (
  SELECT ct AS value, initcap(ct) AS label, count(*) AS count
  FROM f WHERE f_lang AND f_region AND f_st AND ct NOT IN ('', 'unknown')
  GROUP BY 1, 2
),
language_b AS (
  SELECT lang.code AS value,
         COALESCE(max(lang.name), CASE lang.code
           WHEN 'en' THEN 'English' WHEN 'hi' THEN 'Hindi' WHEN 'hinglish' THEN 'Hinglish'
           WHEN 'bn' THEN 'Bengali' WHEN 'gu' THEN 'Gujarati' WHEN 'pa' THEN 'Punjabi'
           WHEN 'ta' THEN 'Tamil' WHEN 'te' THEN 'Telugu' WHEN 'kn' THEN 'Kannada'
           WHEN 'ml' THEN 'Malayalam' WHEN 'mr' THEN 'Marathi' WHEN 'or' THEN 'Odia'
           WHEN 'ur' THEN 'Urdu' WHEN 'as' THEN 'Assamese' ELSE upper(lang.code) END) AS label,
         count(DISTINCT f.id) AS count
  FROM f JOIN lang ON lang.id = f.id
  WHERE f.f_region AND f.f_fmt AND f.f_st
  GROUP BY lang.code
),
region_b AS (
  SELECT mk.key AS value, max(mk.label) AS label, count(DISTINCT f.id) AS count
  FROM f JOIN mk ON mk.id = f.id
  WHERE f.f_lang AND f.f_fmt AND f.f_st AND mk.key <> ''
  GROUP BY mk.key
),
weeks AS (
  SELECT (p.this_week - (11 - i) * 7) AS week_start, i
  FROM p, generate_series(0, 11) AS i
),
week_counts AS (
  SELECT w.week_start, w.i,
         (SELECT count(*) FROM hits h
          WHERE h.fs IS NOT NULL
            AND (date_trunc('week', h.fs AT TIME ZONE 'UTC'))::date = w.week_start) AS launched
  FROM weeks w
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM hits),
  'capped', false,
  'status',   COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', count) ORDER BY count DESC, label) FROM status_b), '[]'::jsonb),
  'format',   COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', count) ORDER BY count DESC, label) FROM format_b), '[]'::jsonb),
  'language', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC, x->>'label') FROM (
                 SELECT jsonb_build_object('value', value, 'label', label, 'count', count) AS x FROM language_b ORDER BY count DESC, label LIMIT 50) s), '[]'::jsonb),
  'region',   COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'count')::int DESC, x->>'label') FROM (
                 SELECT jsonb_build_object('value', value, 'label', label, 'count', count) AS x FROM region_b ORDER BY count DESC, label LIMIT 20) s), '[]'::jsonb),
  'momentum', jsonb_build_object(
    'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('weekStart', to_char(week_start, 'YYYY-MM-DD'), 'launched', launched) ORDER BY i) FROM week_counts), '[]'::jsonb),
    'launched7d',  (SELECT count(*) FROM hits WHERE fs IS NOT NULL AND fs >= now() - interval '7 days'),
    'launched30d', (SELECT count(*) FROM hits WHERE fs IS NOT NULL AND fs >= now() - interval '30 days'),
    'datedCreatives', (SELECT count(*) FROM hits WHERE fs IS NOT NULL)
  )
);
$$;

REVOKE ALL ON FUNCTION public.adspy_facets_for_ids(UUID[],TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_facets_for_ids(UUID[],TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;


-- Recompute and store one advertiser's unfiltered summary (call after ingest).
CREATE OR REPLACE FUNCTION public.adspy_refresh_advertiser_summary(
  p_platform TEXT,
  p_page_id TEXT,
  p_country TEXT
)
RETURNS public.adspy_advertiser_summaries
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_platform TEXT := lower(trim(COALESCE(p_platform, 'meta')));
  v_page     TEXT := trim(COALESCE(p_page_id, ''));
  v_country  TEXT := upper(trim(COALESCE(p_country, 'IN')));
  v_ids      UUID[];
  v_facets   JSONB;
  v_metrics  JSONB;
  v_row      public.adspy_advertiser_summaries;
BEGIN
  IF v_page = '' THEN
    RAISE EXCEPTION 'adspy_refresh_advertiser_summary requires a Page ID';
  END IF;

  SELECT COALESCE(array_agg(c.id), '{}') INTO v_ids
  FROM public.ad_intelligence_creatives c
  WHERE c.platform = v_platform
    AND c.advertiser_id = v_page
    AND EXISTS (SELECT 1 FROM public.ad_intelligence_markets m WHERE m.creative_id = c.id AND m.country = v_country);

  v_facets := public.adspy_facets_for_ids(v_ids, v_country);

  SELECT to_jsonb(x) INTO v_metrics
  FROM public.adspy_search_metrics_v2_page('', v_country, v_platform, 'advertiser', v_page, NULL, NULL, NULL, NULL) x;

  INSERT INTO public.adspy_advertiser_summaries AS s
    (platform, advertiser_id, country, total_ads, active_ads, facets, metrics, computed_at)
  VALUES (
    v_platform, v_page, v_country,
    COALESCE((v_facets->>'total')::int, 0),
    COALESCE((v_metrics->>'active_ads')::int, 0),
    v_facets, COALESCE(v_metrics, '{}'::jsonb), now())
  ON CONFLICT (platform, advertiser_id, country) DO UPDATE
    SET total_ads = EXCLUDED.total_ads,
        active_ads = EXCLUDED.active_ads,
        facets = EXCLUDED.facets,
        metrics = EXCLUDED.metrics,
        computed_at = EXCLUDED.computed_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_refresh_advertiser_summary(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_refresh_advertiser_summary(TEXT,TEXT,TEXT) TO service_role;


-- Search facets. Unfiltered Page-ID requests are served from the summary
-- (refreshed if older than 6 hours); everything else is computed in one query.
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
      AND strpos(lower(COALESCE(c.advertiser_name, '')), v_query) > 0;
  END IF;

  RETURN public.adspy_facets_for_ids(v_ids, v_country, p_language, p_region, p_creative_type, p_active_status);
END;
$$;

REVOKE ALL ON FUNCTION public.adspy_search_facets(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adspy_search_facets(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;


-- Backfill summaries for every advertiser that has a Page ID today.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT c.platform, c.advertiser_id, m.country
    FROM public.ad_intelligence_creatives c
    JOIN public.ad_intelligence_markets m ON m.creative_id = c.id
    WHERE c.advertiser_id IS NOT NULL AND c.advertiser_id <> ''
  LOOP
    PERFORM public.adspy_refresh_advertiser_summary(r.platform, r.advertiser_id, r.country);
  END LOOP;
END $$;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20260925030000', 'adspy_facets_and_summaries_v1')
ON CONFLICT DO NOTHING;

COMMIT;

-- Rollback: DROP FUNCTION adspy_search_facets, adspy_refresh_advertiser_summary,
-- adspy_facets_for_ids; DROP TABLE adspy_advertiser_summaries. The app falls
-- back to the old PostgREST facet counting if the RPC is missing.
