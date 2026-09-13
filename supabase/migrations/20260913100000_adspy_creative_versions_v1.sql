BEGIN;

-- ============================================================
-- CREATIVE VERSION HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ad_intelligence_creative_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  creative_id UUID NOT NULL
    REFERENCES public.ad_intelligence_creatives(id)
    ON DELETE CASCADE,

  content_hash TEXT NOT NULL,

  advertiser_name TEXT,
  advertiser_id TEXT,

  creator_name TEXT,
  partnership_type TEXT,

  creative_type TEXT,

  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  video_duration_seconds INTEGER,

  primary_text TEXT,
  headline TEXT,
  description TEXT,
  call_to_action TEXT,

  landing_page_url TEXT,
  source_url TEXT,

  product_name TEXT,
  product_price NUMERIC,
  max_price NUMERIC,
  currency TEXT,

  offer TEXT,

  transcript TEXT,
  transcript_status TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_currently_active BOOLEAN,

  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  seen_count INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (
    creative_id,
    content_hash
  )
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_versions_creative_idx
ON public.ad_intelligence_creative_versions (
  creative_id,
  last_observed_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_versions_hash_idx
ON public.ad_intelligence_creative_versions (
  content_hash
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_versions_last_seen_idx
ON public.ad_intelligence_creative_versions (
  last_observed_at DESC
);

CREATE INDEX IF NOT EXISTS
  ad_intelligence_creative_versions_active_idx
ON public.ad_intelligence_creative_versions (
  is_currently_active,
  last_observed_at DESC
);

-- ============================================================
-- CONTENT HASH
-- ============================================================

CREATE OR REPLACE FUNCTION public.adspy_creative_content_hash(
  p_advertiser_name TEXT,
  p_advertiser_id TEXT,
  p_creator_name TEXT,
  p_partnership_type TEXT,
  p_creative_type TEXT,
  p_image_url TEXT,
  p_video_url TEXT,
  p_thumbnail_url TEXT,
  p_video_duration_seconds INTEGER,
  p_primary_text TEXT,
  p_headline TEXT,
  p_description TEXT,
  p_call_to_action TEXT,
  p_landing_page_url TEXT,
  p_source_url TEXT,
  p_product_name TEXT,
  p_product_price NUMERIC,
  p_max_price NUMERIC,
  p_currency TEXT,
  p_offer TEXT,
  p_transcript TEXT,
  p_transcript_status TEXT,
  p_metadata JSONB
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5(
    concat_ws(
      E'\u001f',

      lower(trim(coalesce(p_advertiser_name, ''))),
      lower(trim(coalesce(p_advertiser_id, ''))),
      lower(trim(coalesce(p_creator_name, ''))),
      lower(trim(coalesce(p_partnership_type, ''))),
      lower(trim(coalesce(p_creative_type, ''))),

      trim(coalesce(p_image_url, '')),
      trim(coalesce(p_video_url, '')),
      trim(coalesce(p_thumbnail_url, '')),

      coalesce(p_video_duration_seconds, 0)::TEXT,

      trim(regexp_replace(
        coalesce(p_primary_text, ''),
        '\s+',
        ' ',
        'g'
      )),

      trim(regexp_replace(
        coalesce(p_headline, ''),
        '\s+',
        ' ',
        'g'
      )),

      trim(regexp_replace(
        coalesce(p_description, ''),
        '\s+',
        ' ',
        'g'
      )),

      lower(trim(coalesce(p_call_to_action, ''))),

      trim(coalesce(p_landing_page_url, '')),
      trim(coalesce(p_source_url, '')),

      lower(trim(coalesce(p_product_name, ''))),

      coalesce(p_product_price, 0)::TEXT,
      coalesce(p_max_price, 0)::TEXT,

      lower(trim(coalesce(p_currency, ''))),

      trim(regexp_replace(
        coalesce(p_offer, ''),
        '\s+',
        ' ',
        'g'
      )),

      trim(regexp_replace(
        coalesce(p_transcript, ''),
        '\s+',
        ' ',
        'g'
      )),

      lower(trim(coalesce(p_transcript_status, ''))),

      coalesce(p_metadata, '{}'::jsonb)::TEXT
    )
  );
$$;

-- ============================================================
-- SNAPSHOT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.adspy_capture_creative_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  version_hash TEXT;
  observed_at_value TIMESTAMPTZ;
BEGIN
  version_hash := public.adspy_creative_content_hash(
    NEW.advertiser_name,
    NEW.advertiser_id,
    NEW.creator_name,
    NEW.partnership_type,
    NEW.creative_type,
    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,
    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,
    NEW.landing_page_url,
    NEW.source_url,
    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,
    NEW.offer,
    NEW.transcript,
    NEW.transcript_status,
    NEW.metadata
  );

  observed_at_value :=
    COALESCE(
      NEW.last_seen_at,
      NEW.updated_at,
      now()
    );

  INSERT INTO public.ad_intelligence_creative_versions (
    creative_id,
    content_hash,

    advertiser_name,
    advertiser_id,

    creator_name,
    partnership_type,

    creative_type,

    image_url,
    video_url,
    thumbnail_url,
    video_duration_seconds,

    primary_text,
    headline,
    description,
    call_to_action,

    landing_page_url,
    source_url,

    product_name,
    product_price,
    max_price,
    currency,

    offer,

    transcript,
    transcript_status,

    metadata,

    is_currently_active,

    first_observed_at,
    last_observed_at,
    seen_count
  )
  VALUES (
    NEW.id,
    version_hash,

    NEW.advertiser_name,
    NEW.advertiser_id,

    NEW.creator_name,
    NEW.partnership_type,

    NEW.creative_type,

    NEW.image_url,
    NEW.video_url,
    NEW.thumbnail_url,
    NEW.video_duration_seconds,

    NEW.primary_text,
    NEW.headline,
    NEW.description,
    NEW.call_to_action,

    NEW.landing_page_url,
    NEW.source_url,

    NEW.product_name,
    NEW.product_price,
    NEW.max_price,
    NEW.currency,

    NEW.offer,

    NEW.transcript,
    NEW.transcript_status,

    NEW.metadata,

    NEW.is_currently_active,

    observed_at_value,
    observed_at_value,
    1
  )
  ON CONFLICT (
    creative_id,
    content_hash
  )
  DO UPDATE
  SET
    last_observed_at =
      GREATEST(
        public.ad_intelligence_creative_versions.last_observed_at,
        EXCLUDED.last_observed_at
      ),

    is_currently_active =
      EXCLUDED.is_currently_active,

    seen_count =
      public.ad_intelligence_creative_versions.seen_count + 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  adspy_creative_version_capture
ON public.ad_intelligence_creatives;

CREATE TRIGGER
  adspy_creative_version_capture
AFTER INSERT OR UPDATE
ON public.ad_intelligence_creatives
FOR EACH ROW
EXECUTE FUNCTION public.adspy_capture_creative_version();

-- ============================================================
-- HISTORY RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.adspy_creative_history(
  p_query TEXT,
  p_country TEXT,
  p_platform TEXT,
  p_mode TEXT DEFAULT 'advertiser',
  p_limit INTEGER DEFAULT 300
)
RETURNS TABLE (
  version_id UUID,
  creative_id UUID,
  content_hash TEXT,

  advertiser_name TEXT,
  advertiser_id TEXT,

  creator_name TEXT,
  partnership_type TEXT,

  creative_type TEXT,

  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,

  primary_text TEXT,
  headline TEXT,
  description TEXT,
  call_to_action TEXT,

  landing_page_url TEXT,
  source_url TEXT,

  product_name TEXT,
  product_price NUMERIC,
  max_price NUMERIC,
  currency TEXT,

  offer TEXT,

  transcript TEXT,

  is_currently_active BOOLEAN,

  first_observed_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,

  seen_count INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    v.id,
    v.creative_id,
    v.content_hash,

    v.advertiser_name,
    v.advertiser_id,

    v.creator_name,
    v.partnership_type,

    v.creative_type,

    v.image_url,
    v.video_url,
    v.thumbnail_url,

    v.primary_text,
    v.headline,
    v.description,
    v.call_to_action,

    v.landing_page_url,
    v.source_url,

    v.product_name,
    v.product_price,
    v.max_price,
    v.currency,

    v.offer,

    v.transcript,

    v.is_currently_active,

    v.first_observed_at,
    v.last_observed_at,

    v.seen_count

  FROM public.ad_intelligence_creative_versions v

  INNER JOIN public.ad_intelligence_creatives c
    ON c.id = v.creative_id

  WHERE lower(trim(c.platform)) =
        lower(trim(p_platform))

    AND EXISTS (
      SELECT 1
      FROM public.ad_intelligence_markets m
      WHERE m.creative_id = c.id
        AND upper(trim(m.country)) =
            upper(trim(p_country))
    )

    AND (
      (
        lower(trim(p_mode)) = 'advertiser'

        AND lower(
          coalesce(
            c.advertiser_name,
            ''
          )
        ) LIKE '%' ||
          lower(trim(p_query)) ||
          '%'
      )

      OR

      (
        lower(trim(p_mode)) = 'keyword'

        AND (
          lower(coalesce(c.advertiser_name, ''))
            LIKE '%' || lower(trim(p_query)) || '%'

          OR lower(coalesce(c.creator_name, ''))
            LIKE '%' || lower(trim(p_query)) || '%'

          OR lower(coalesce(v.headline, ''))
            LIKE '%' || lower(trim(p_query)) || '%'

          OR lower(coalesce(v.primary_text, ''))
            LIKE '%' || lower(trim(p_query)) || '%'

          OR lower(coalesce(v.offer, ''))
            LIKE '%' || lower(trim(p_query)) || '%'

          OR lower(coalesce(v.call_to_action, ''))
            LIKE '%' || lower(trim(p_query)) || '%'
        )
      )
    )

  ORDER BY
    v.last_observed_at DESC,
    v.created_at DESC

  LIMIT LEAST(
    3000,
    GREATEST(
      1,
      COALESCE(p_limit, 300)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.adspy_creative_history(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.adspy_creative_history(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER
) TO service_role;

COMMIT;